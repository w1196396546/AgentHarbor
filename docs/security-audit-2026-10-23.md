# AgentHarbor 安全审计记录

- **日期**：2026-10-23
- **范围**：本仓库 `agentharbor`（Go 中继 + React 前端 + 部署模板）
- **方法**：逐文件源码审读 + 定向 grep + 现有测试审视；**未做**动态探测、模糊测试、渗透测试
- **明确不含**：agentTools 仓库（`internal/remoteclient`，桌面连接端 / Agent 适配器）

本文是一次人工代码审计的记录，不是验收结论。文中"高危/中危/低危"指本仓库内问题的严重度，不覆盖跨仓库链路；跨仓库问题在"覆盖盲区"单独说明。

---

## 严重度汇总

| # | 严重度 | 问题 | 主要位置 |
| --- | --- | --- | --- |
| 1 | 高（仅可用性） | 反向代理后限流键塌缩，单点可锁死全站配对、登录与管理员 | `internal/relay/http.go:113` |
| 2 | 中（依赖跨仓库确认） | Markdown 链接可诱导读取项目外任意本地文件 | `web/src/features/markdown.jsx:28` |
| 3 | 中 | E2EE 会话密钥与 grant 明文存于 localStorage | `web/src/transport/secure.js:3` |
| 4 | 低 | Caddy 示例的 Host 头会触发自身 403 | `deployment/Caddyfile.example:8` |
| 5 | 低 | 默认开启匿名设备注册，可被填满配额 | `deployment/config.example.json:4` |
| 6 | 低（加固） | systemd 单元缺沙箱强化 | `deployment/agentharbor.service` |
| 7 | 低（加固） | nginx 示例缺 TLS 下限、HSTS、HTTP 跳转 | `deployment/nginx.conf.example` |
| 8 | 低（加固） | 状态写入缺目录 fsync | `internal/relay/state.go:158` |
| 9 | 低 | 审批弹窗可被注入任意外部链接（钓鱼面） | `web/src/features/approvals.jsx:159` |

---

## 1. 高危（可用性）：限流在反向代理后塌缩为全局单桶

### 位置

`internal/relay/http.go:113-139`（`allowAttempt`），调用点：

- `internal/relay/pairing.go:16` — `pair`，12 次/分钟
- `internal/relay/connection.go:63` — `connect`，30 次/分钟
- `internal/relay/users.go:40` — `account-login`，10 次/分钟
- `internal/relay/admin_auth.go:74-89` — 管理员登录，10 次/10 分钟（独立实现，同样以 IP 为键）

### 机制

```go
func (s *Server) allowAttempt(kind, remote string, limit int) bool {
	host, _, err := net.SplitHostPort(remote)   // remote 即 r.RemoteAddr
	key := kind + ":" + host
	...
}
```

四个限流器全部以 `r.RemoteAddr` 的 IP 部分为键。项目推荐且示例提供的部署方式都是反向代理（`deployment/nginx.conf.example`、`deployment/Caddyfile.example` 均为 `proxy_pass 127.0.0.1:8080`），因此进程看到的 `RemoteAddr` **永远是 `127.0.0.1`**。

同时确认：

- `nginx.conf.example` 未设置 `X-Forwarded-For` / `X-Real-IP`
- Go 侧全仓库无任何 `X-Forwarded-*` / `X-Real-IP` 读取（grep 已确认）

结果：所有公网用户共享 `pair:127.0.0.1` 等**同一个桶**，限流从"每人限额"退化为"全站限额"。

### 影响

攻击者无需任何凭证即可造成定向拒绝服务：

| 端点 | 限额 | 攻击成本 | 合法用户后果 |
| --- | --- | --- | --- |
| `POST /api/admin/login` | 10 次 / 10 分钟 | 10 个请求 | 管理员 10 分钟内完全无法登录，可持续续期 |
| `POST /api/pair` | 12 次 / 1 分钟 | 12 个请求 | 全站任何人都无法完成浏览器配对 |
| `GET /api/client/connect` | 30 次 / 1 分钟 | 30 个请求 | 所有桌面客户端无法重连 |
| `POST /api/account/login` | 10 次 / 1 分钟 | 10 个请求 | 全站账户登录被拒 |

补充细节：

- `admin_auth.go:84` 的配额检查发生在**校验凭证之前**，合法管理员的一次成功登录同样消耗配额。
- `/api/admin/*` 同时挂在公网监听器上（见下），使管理员锁定从"需要隧道"变为"公网任意人可及"。
- 同一 NAT 后的多个正常用户会互相挤占配额。

**影响类别是可用性（DoS），不涉及机密性或完整性**；`allowAttempt` 本身有 2048 条上限与过期清理，不会内存耗尽。

### 关于 `/admin/` 暴露在公网

`internal/relay/http.go:93-102` 把 `Admin.Handler()` 挂到公网 8080 上。经核对 `docs/deploy.md:81`，**这是文档写明的设计**（"正常公网入口也提供 `/admin/`，使用独立管理认证"），并有 `validOrigin`（`admin_auth.go:22-43`）、独立凭证、`SameSite=Strict`、`X-Remote-Admin` 头校验等防护，**不构成鉴权绕过**。它只是放大了上面这条 DoS 的暴露面。若不希望公网可达，`deploy.md:83` 已给出在代理层限制 `/admin/` 与 `/api/admin/` 的做法。

### 复现（静态推理，未实测）

1. 部署在示例中的 nginx 之后，`proxy_pass 127.0.0.1:8080`。
2. 从任意一台机器，每分钟向 `https://<公网地址>/api/pair` 发送 12 个任意 POST 请求。
3. 正常用户在浏览器中生成授权码后配对，持续返回 `429 Too many pairing attempts`。

### 修复建议

优先级从高到低：

1. **代理层限流**：nginx 用 `limit_req_zone $binary_remote_addr`；Caddy 用 `rate_limit`。这是唯一不依赖应用信任链的方案。
2. **代理层拒绝管理路由**：`location ~ ^/(api/)?admin { deny all; }`，或 Caddy `respond 404`，改走 SSH 隧道访问回环管理页。
3. **应用层可信代理**：仅当请求来自**显式白名单**的代理地址时才解析 `X-Forwarded-For`，并取最右侧可信段。**不要无脑信任 XFF**——直接信任客户端可控头比现状更糟。
4. **管理员锁定与 IP 解耦**：除按 IP 计数外，增加与全局容量无关的退避策略，避免单点锁死。

### 回归测试建议

现有 `server_test.go` 覆盖了 CSRF 与配对隔离，但**没有任何跨代理的限流用例**。建议补一个测试：以两个不同的 `RemoteAddr` 经同一代理配置发起请求，断言二者的配额互不影响。

---

## 2. 中危：Markdown 链接可诱导读取项目外的任意本地文件

### 位置

- `web/src/features/markdown.jsx:28-53` — `localFileTarget`
- `web/src/features/markdown.jsx:81-91` — 渲染 sink
- `web/src/features/files.jsx:236-256` — `openProjectFile`
- `web/src/features/files.jsx:214-218` — `projectFileURL`

### 机制

```js
function localFileTarget(value) {
  let path = value.trim().replace(/^<|>$/g, "");
  ...
  if (!/^(?:\/|\.\.?\/)/.test(path) && !path.includes("/") && !/\.[^./\s]+$/.test(path))
    return null;
  return { path, line };
}
```

该函数**明确接受**以 `/` 开头的绝对路径和以 `../` 开头的相对路径，`decodeURIComponent` 解码后直接作为 `data-file-path` 渲染为可点击链接；点击后调用 `openProjectFile(path)`，最终对 `project-file?thread=…&path=…` 发起加密请求并把返回内容渲染到预览面板。

**客户端本身不做任何项目根目录约束**，路径合法性完全交给下游。

### 攻击路径

模型输出、被投毒的 MCP 工具结果、或模型总结的仓库内容中出现：

```
[查看部署日志](/Users/<用户>/.ssh/id_rsa)
[配置](../../.env)
```

渲染为外观正常的链接。用户点击一次即把该文件读入预览面板。

- 不可信来源：LLM 输出 / 本机文件内容 / MCP 工具返回
- 触发条件：**用户主动点击**（不是自动执行）
- 子代理只读模式（`subagents.jsx:17` 的 `readOnly`）会正确降级为纯文本，主会话不会

### 关键限制

`/api/project-file` 的实际实现在 **agentTools 仓库**（本仓库的 `http.go:60-72` 对该路径只返回 `426 Upgrade Required`，因为请求必须走 E2EE 通道）。因此**无法从本仓库确认下游是否校验项目根目录**。若 agentTools 侧也未做约束，这是一条真实的任意文件读取原语；若下游有校验，则本条降为纵深防御缺失。

### 附带逻辑缺陷（非漏洞）

`markdown.jsx:74-75` 先尝试 `localFileTarget` 再尝试 `safeURL`，导致 `//evil.com/path` 被识别为本地文件路径而非外部链接。功能上不正确，安全上无害。

### 修复建议

- 客户端在 `openProjectFile` 中对 `path` 做 `filepath.Clean` 后校验是否位于当前项目根内，拒绝越界路径。
- **同时**确认 agentTools 侧对 `project-file` 的 `path` 参数有独立校验。客户端校验不能替代服务端校验——攻击者可以直接构造加密请求。

---

## 3. 中危：E2EE 会话密钥与 grant 明文存于 localStorage

### 位置

`web/src/transport/secure.js:3, 66-74, 85`

- 存储键：`codex.remote.secure.v1`、`codex.remote.devices.v1`
- 内容：32 字节会话密钥的十六进制明文、bearer `grant`、到期时间，最多 16 台设备

### 机制与影响

浏览器端没有"不可导出密钥"的持久存储方案，密钥必须可被 JS 读取才能每次发起请求时派生。这是纯浏览器客户端的固有取舍，不是实现缺陷。

风险在于：**任何同源脚本执行 = 全部密钥与 grant 泄露**。来源包括被投毒的 npm 依赖、浏览器扩展、未来引入的 XSS。

值得肯定的是当前缓解措施到位：`script-src 'self'`、三个入口 HTML 均无内联脚本、`web/src` 内零 `dangerouslySetInnerHTML` / `eval` / `postMessage`。因此评为中危而非高危。

### 修复建议

- 保持并定期审计依赖（`npm audit`、锁文件审查）。
- 如需更强隔离，可评估让密钥仅存在于 `CryptoKey` 对象（非可导出）并以 IndexedDB 持久化的方案，但需权衡浏览器兼容性与实现复杂度。
- 文档中应明确告知用户该边界，避免误以为"E2EE"可抵御同源脚本。

---

## 4. 低危：Caddy 示例的 Host 头会触发自身 403

### 位置

`deployment/Caddyfile.example:8`

```
header_up Host {http.request.hostport}
```

### 机制

应用在 `internal/relay/http.go:80` 用 `s.public.Host`（**不含端口**）与 `r.Host` 比较。当客户端显式携带端口（如 `https://remote.example.com:443/`）时，`{http.request.hostport}` 产出 `host:443`，比较失败返回 403。

Caddy 默认已保留原始 Host，这一行是多余的。nginx 示例中的 `$http_host` 行为正确。

### 修复

改为 `header_up Host {http.request.host}`，或直接删除该行。

---

## 5. 低危：默认开启匿名设备注册

### 位置

`deployment/config.example.json:4` — `"registration_enabled": true`

### 机制

公网实例允许匿名注册设备（`connection.go:106`，`registration_enabled` 为 `nil` 时默认允许）。每次 `GET /api/client/connect` 消耗一次配额（30/分钟），约 34 分钟即可填满 `maxDevices = 1000`，此后**合法新设备无法注册**。

已有缓解：受 `allowAttempt` 限制、已有设备仍可重连、容量上限有界。

### 修复

自部署生产实例建议显式设 `"registration_enabled": false`，并在示例中注明这是有意的默认值。

---

## 6. 低危（加固）：systemd 单元缺沙箱强化

### 位置

`deployment/agentharbor.service`

现状：user unit（不以 root 运行）、`UMask=0077`，这两点是对的。

建议补充：

```
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=%h/.local/share/agentharbor
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
```

并在注释中明确：**复制到 `/etc/systemd/system` 时必须补 `User=`，否则会静默以 root 运行**。

---

## 7. 低危（加固）：nginx 示例的 TLS 配置

### 位置

`deployment/nginx.conf.example`

缺失项：

- HTTP → HTTPS 跳转的 server 块
- `ssl_protocols` / `ssl_min_version`（旧版 nginx 默认允许 TLS 1.0/1.1）
- `add_header Strict-Transport-Security`

Caddy 默认已包含以上全部。

### 已确认一致的部分

- 正文上限：nginx `client_max_body_size 48m` = Caddy `max_size 48MiB` = Go `48<<20`（`secure.go:73`）
- WebSocket 升级头、`proxy_buffering off`、长连接超时均已正确配置
- 示例中无任何密钥、token 或私钥路径

---

## 8. 低危（加固）：状态写入缺目录 fsync

### 位置

`internal/relay/state.go:142-160`

`os.Rename` 之后没有对所在目录执行 `fsync`。掉电时目录项更新可能未落盘，导致最后一次 rename 丢失（不是数据损坏——临时文件已 `Sync` 且 rename 是原子的）。

### 修复

rename 后打开目录句柄并 `Sync()`。

---

## 9. 低危：审批弹窗可注入任意外部链接

### 位置

`web/src/features/approvals.jsx:159`

```js
const href = p.mode === "url" ? safeURL(p.url) : null;
```

`safeURL` 只做 scheme 白名单（`https`/`http`/`mailto`），MCP elicitation 可塞入 `https://attacker.example/…`，在用户最信任的授权弹窗里生成 "Open tool authorization" 链接。

已有缓解：`rel="noreferrer noopener"`，不存在 tab-nabbing。

### 修复

在链接旁显示目标域名；或对非预期域名给出显式警示。

---

## 已确认无问题

以下各项经检索与逐处阅读确认：

### 加密与授权边界

- **中继不持有解密密钥**：状态文件只有设备/浏览器授权 ID 的路由映射（`state.go:17-23`），无密钥、无原始 token、无会话内容。
- **浏览器无法伪造内层头**：`secure.go:74-79` 用全新 `http.Header` 覆盖，只注入 `X-Remote-Grant` / `X-Remote-Request` 等固定值。路径也被强制改写为 `/_remote/secure`（`secure.go:71`）。
- **响应头白名单**：`secure.go:97` 只放行 `Content-Type`、`Content-Disposition` 等 8 个头，客户端无法注入 `Set-Cookie` 或改安全策略；并强制附加 `default-src 'none'; sandbox`（`secure.go:109`）。
- **配对响应有界**：`pairing.go:183` 限制 8 KiB，超出即 `overflow`；`server_test.go` 有对应用例。
- **配对校验完整**：`pairing.go:98` 同时校验 `Grant == ID`、`Sealed.ID == in.ID`、`ExpiresAt` 未过期、`validHex` 格式；`pairing.go:114` 在保存前复查设备未撤销且连接未变。
- **容量上限**：`maxDevices=1000`、`maxBrowserSessions=4096`、单浏览器 16 台设备，均在被绕过前检查（`pairing.go:31`、`device_sessions_test.go:209` 有用例）。
- **管理员凭证**：`admin.go:31` 用 `O_EXCL` 创建、`0600`；`admin.go:60` 加载时校验权限位；`admin_auth.go:113` 用 `subtle.ConstantTimeCompare` 比较 `sha256`；会话以 `sha256(cookie)` 为键（`admin_auth.go:133`）；管理监听强制回环（`admin.go:84`）。
- **账户 token 不外泄**：`server.go:72` 的 `CheckRedirect` 返回 `ErrUseLastResponse`，防止 Bearer token 经 302 泄漏到第三方；`users.go:164` 拒绝含 CR/LF/NUL 的 token；`users.go:192` 只采纳平台签发的字段。
- **登出与撤销传播**：`sessions.go:152`、`devices.go:63`、`users.go:367-379` 删除会话并调用 `cancelRequests` 终止活动流。

### 传输层

- **无 SSRF 面**：`Peer` 以 `http.NotFoundHandler()` 为入站处理器（`peer.go:61-63`），响应侧忽略客户端返回的 URL；`request.go:37` 拒绝绝对 URL 与 `//host` 开头（`tunnel_test.go:121` 有用例）。
- **帧边界**：`protocol.go:34-51` 校验 ID 长度、数据块 ≤ 32 KiB、错误串 ≤ 1 KiB、状态码 100-599；`peer.go:65` 设置读上限；`peer.go:212` 限制 32 条并发流（`tunnel_test.go:164/629` 有用例）。
- **背压与取消**：`handler.go:13-26` 信用窗口 + `peer.go:131-144` 溢出即断开；`tunnel_test.go` 覆盖停滞上传、断线、取消传播。
- **头清洗**：`protocol.go:53-71` 删除 hop-by-hop 头并展开 `Connection` 中的动态项。

### 持久化

- **符号链接与权限**：`state.go:54` `Lstat` 拒绝非普通文件；`state.go:39-44` 目录 `0700`；`state.go:126` 文件 `0600`；`state.go:63/72` 校验大小与 schema 上限。
- **失败不覆盖**：`state.go:68-73` 解析失败直接返回错误拒绝启动，不会当作空状态覆盖原文件（`encryption_test.go:103` 有用例）。
- **原子写**：临时文件 → `Write` → `Sync` → `Close` → `Rename`（`state.go:142-160`）。
- **启动清理旧明文**：`encryption_test.go:61` 覆盖旧 grant 的原子删除。

### 前端

- **零 HTML 注入 sink**：`web/src` 全量检索无 `dangerouslySetInnerHTML` / `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write` / `DOMParser` / `eval` / `new Function` / `postMessage`。产物 `remote.js` 中仅有的 `innerHTML` 来自 React 19 内部。
- **Markdown 不经过 HTML**：手写解析器直接产出 React 元素，不存在"渲染后再净化"的窗口。
- **链接 scheme 白名单**：`markdown.jsx:18-27` 仅放行 `https`/`http`/`mailto`；`javascript:`、`data:`、`vbscript:`、`blob:` 均返回 `null` 并降级为纯文本；`new URL` 会规范化大小写并剥离制表符/换行，`JaVaScRiPt:`、`java\tscript:` 同样被拒。
- **新窗口**：两处 `target="_blank"`（`markdown.jsx:93`、`approvals.jsx:200`）均带 `rel="noreferrer noopener"`。
- **图标**：`RemoteIcon.jsx` 走组件注册表查询，不注入原始 SVG 字符串。
- **文件预览**：`files.jsx` 用 `textContent` 写入文件名，下载用新建 blob URL + 客户端 `download` 属性，不可穿越；`conversation.jsx:449` 对 `data:` 图片限制为 `png|jpeg|webp|gif` 且 < 2 MB，**刻意排除 SVG**。
- **密码学实现**：仅用 `crypto.getRandomValues`（`secure.js:7`），全仓库无 `Math.random`；HKDF-SHA256 派生 + AES-256-GCM + 128 位 tag（`secure.js:24,29`）；每个消息用随机 16 字节 salt 重新派生密钥，因此 sequence 0 的固定 IV 不复用；`AAD` 绑定 purpose/id/sequence；`TextDecoder({fatal:true})` 拒绝非法 UTF-8；NDJSON 单行上限 100 KB、事件流缓冲上限 8 MB。
- **配对码处理**：从 URL fragment 读取后经 `history.replaceState` 清除（`controller.jsx:990-992`），不入日志；`web/src` 无 `console.*`。
- **CSP**：`http.go:75` 为 `default-src 'self'`，三个入口 HTML 无内联脚本，策略可真正落地。

### 凭证卫生

- 仓库内无硬编码密码/密钥/token（唯一命中是 `approvals.jsx:359` 浏览器自动填充字段名映射 `{password:"password", email:"email", uri:"url"}`）。
- 无 `.pem` / `.key` / `.p12` 等私钥文件。
- `.gitignore` 覆盖 `state/`、`data/`、`*.log` 与编译产物。
- Dockerfile 多阶段构建、`USER 10001:10001`、`CGO_ENABLED=0 -trimpath`、不从 URL `ADD`、不 COPY 密钥；`.dockerignore` 排除 `.env` / `*.pem` / `*.key`。

---

## 复核后判定为误报

审计过程中提出但经回溯源码确认**不成立**的三条，记录在此避免重复排查：

1. **`assets.go:67` 的 `LastIndex(path, ".")` 可能越界**
   该行只在 `bundles` 命中的路径上执行，而六个 bundle 名（`remote.js` 等）全部含点，`LastIndex` 不可能返回 -1。不可达。

2. **"管理监听器未与公网隔离"**
   `/admin/` 出现在公网入口是 `docs/deploy.md:81` 写明的行为，且有独立凭证、`validOrigin`、`SameSite=Strict`、`X-Remote-Admin` 头校验，不存在绕过。真正的问题是第 1 条的限流塌缩。

3. **`connection.go:111` / `users.go:111` 运算符优先级导致绕过**
   Go 中 `&&` 优先级高于 `||`。展开后为 `s.closed || (ownerID != 0 && disabled) || (newUser && userCap) || 在线 || (exists && (revoked || 哈希不匹配)) || (!exists && (!allowedNew || 设备满))`，语义与预期一致，`subtle.ConstantTimeCompare` 也确实参与判定。未发现绕过。

---

## 覆盖盲区

本次审计**没有覆盖**以下内容，报告中不应被视为已验收：

1. **agentTools 仓库**（`internal/remoteclient`）：配对码生成与消耗、`project-file` 路径校验、适配器执行沙箱、owner 接管逻辑、本机文件访问边界。第 2 条中危的根因大概率在此仓库。
2. **动态测试**：未对运行实例发起主动探测、目录遍历尝试、并发压测或模糊测试。所有结论来自静态阅读。
3. **依赖供应链**：仅查看了直接依赖清单，未运行 `npm audit` 或审查传递依赖。
4. **浏览器运行时**：未在真实 Chromium / WebKit 上验证 CSP 实际生效情况、localStorage 隔离、blob URL 生命周期。
5. **生产部署实例**：未连接目标生产实例核对线上实际参数、代理配置与版本。

---

## 建议修复顺序

1. 修第 1 条（限流塌缩）——唯一可被公网匿名利用、影响全站可用性的问题。
2. 确认 agentTools 侧的 `project-file` 路径校验（第 2 条）。
3. 第 4、5 条（示例配置正确性）——改动极小，避免部署踩坑。
4. 第 6、7、8 条加固项，可与下次常规维护合并。
5. 第 3、9 条属设计边界提示，建议先落到文档再考虑实现改动。
