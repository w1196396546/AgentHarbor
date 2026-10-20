# 部署 anywhereToAgent 中转服务

服务器提供网页、中转和服务端管理；用户电脑运行带“远程连接”的 agentTools，主动通过 WSS 连接。服务器不运行 Agent、不配置模型 API 密钥、不读取用户 Agent 目录、不挂载项目，也不需要为用户设置 SSH。

## 原生部署

需要 Go 1.26.8+ 和 Node.js 22.12+ 构建；`make build` 先构建 React 前端，再嵌入 Go 二进制。构建后的二进制独立运行，目标服务器无需 Node.js。

```sh
make build
./anywhereToAgent --help
mkdir -p "$HOME/.local/share/anywhereToAgent"
chmod 700 "$HOME/.local/share/anywhereToAgent"
cp deployment/config.example.json "$HOME/.local/share/anywhereToAgent/config.json"
```

编辑刚复制的配置，把 `public_url` 改成自己的专用 HTTPS 域名，然后启动：

```sh
./anywhereToAgent \
  --data-dir "$HOME/.local/share/anywhereToAgent" \
  --config "$HOME/.local/share/anywhereToAgent/config.json"
```

配置和命令行选项：

| JSON 字段 | 命令行 | 含义 |
| --- | --- | --- |
| `public_url` | `--public-url` | 浏览器和客户端使用的 HTTPS 入口，例如 `https://remote.example.com`；必须与实际入口一致 |
| `listen_address` | `--listen` | 中转 HTTP 监听，默认 `127.0.0.1:8080`，供本机反向代理访问 |
| `data_dir` | `--data-dir` | 私有配置、设备登记、浏览器会话映射和管理凭证目录 |
| `registration_enabled` | — | 省略为 `true`；`false` 禁止新设备注册，已登记设备仍可凭原凭证重连 |
| — | `--admin-listen` | 独立管理监听，默认 `127.0.0.1:9090`，只允许回环地址 |
| — | `--config` | 严格 JSON 配置文件；显式传入的配置字段命令行选项覆盖文件值 |

新安装默认数据目录为当前用户系统配置目录下的 `anywhereToAgent`；若原 `codex-remote` 目录已存在，继续使用原目录，避免遗失设备登记、浏览器授权和管理凭证。显式 `--data-dir` 或配置中的 `data_dir` 优先；更新已有服务时须保留原数据目录，本文的 anywhereToAgent 目录为新安装示例。`data_dir` 可省略并通过 `--data-dir` 指定。配置中不要写用户项目目录或 Agent 凭证。修改配置文件后重启本服务；服务端管理页展示当前配置、状态和设备，不修改客户端的 Agent 设置。

同机开发可用 `--public-url http://127.0.0.1:8080`，HTTP 仅允许回环地址。手机或远程电脑使用 HTTPS。现有 IP 测试服务使用临时自签名证书，客户端仅对该预设地址内置信任，用户无需粘贴证书；这并不等同于受信任生产入口。自部署应优先使用域名和有效证书。

## HTTPS、WebSocket 与流式输出

将专用域名解析到公网服务器，在同机 Caddy 或 Nginx 终止 TLS，上游为 `127.0.0.1:8080`：

- [Caddyfile.example](../deployment/Caddyfile.example)：替换域名，Caddy 自动管理证书并支持 WebSocket。
- [nginx.conf.example](../deployment/nginx.conf.example)：替换域名和证书路径，包含 WebSocket Upgrade 和 SSE 无缓冲配置。

保留原始 Host，不缓存会话/配对 API，关闭 SSE 响应缓冲。Nginx 的 `map` 段放在 `http` 上下文，`server` 段作为专用站点加入；不要覆盖现有无关站点。CDN/WAF 也必须允许长连接和 WebSocket，否则客户端可能反复离线或输出成批出现。

加密后的 `POST /api/secure` 包含 Base64 和认证数据开销，代理请求正文上限应与中转一致，为 48 MiB：Caddy 使用 `max_size 48MiB`，Nginx 使用 `client_max_body_size 48m`。本机实际附件仍限 20 MiB；代理放宽外层上限不会增加附件上限。响应为流式加密记录，代理须保持无缓冲转发和取消传播。

`/healthz` 返回正常仅证明中转 HTTP 服务可访问。完整验证需要：在 agentTools 连接该 URL、生成授权码、远程浏览器配对、读取项目历史，并发起一次安全测试任务观察流式输出。

## 服务端管理页

本机入口为 <http://127.0.0.1:9090/admin/>；正常公网入口也提供 `/admin/`，使用独立管理认证。首次启动生成 `<data-dir>/admin-token`，权限 `0600`。在服务器安全地读取文件并登录；不要把内容写进命令行参数、聊天记录或版本库。

如果不开放公网管理路由，可以在反向代理限制 `/admin/` 和 `/api/admin/`，从管理电脑建立本地隧道后访问回环管理入口：

```sh
ssh -N -L 9090:127.0.0.1:9090 your-user@your-server
```

这里的 SSH 只用于服务器管理员访问管理页，**用户连接 agentTools 不需要 SSH**。管理页查看当前服务配置和设备连接状态，可撤销设备登记；撤销设备会使其浏览器访问不可用，并阻止原设备凭证再次连接；这是设备封禁，不是临时断开。只需停用某个浏览器时，应在 agentTools 撤销该浏览器授权。服务端管理凭证不能用作客户端配对码，也不能自行给浏览器授予客户端访问权。

共享根目录、Agent 程序/数据目录、授权码和已授权浏览器都在 agentTools 的“远程连接”页管理。服务端重启与关闭会中断转发，客户端在服务恢复后重连；短暂传输中断不会主动取消本机正在执行的任务。

## 用户连接自己的服务器

1. 保持服务端及 HTTPS 反向代理运行。
2. 登录 FullCupAI 后，在 agentTools“远程连接”中选择自定义服务，填写 `https://remote.example.com`，选择本机允许共享的项目。账户须为 active 且余额严格大于零；身份或余额无法验证时拒绝连接，订阅不替代余额条件。
3. 点击连接，确认状态在线，再生成授权码。二维码由本机生成，不调用外部二维码服务。
4. 手机扫码，或打开该服务器网页输入完整授权码。授权码单次有效，10 分钟过期；设备 ID 不足以访问。
5. 配对后浏览器被记住 30 天，可在客户端随时撤销。关闭浏览器不会停止任务；手动断开客户端或退出 agentTools 会停止远程执行引擎自己的任务。

需要经过 agentTools 网关使用模型时，先在 agentTools 配置 Codex 接入。Remote 只转发控制和输出，不代为配置供应商，也不改变模型请求的实际目的地。

## 系统服务

Linux 用户服务模板：[anywhereToAgent.service](../deployment/anywhereToAgent.service)。先按原生部署准备配置文件，再安装；已有服务应先停用旧单元并保留原 `--data-dir`，不要让两份服务同时读写同一目录：

```sh
mkdir -p "$HOME/.local/bin" "$HOME/.config/systemd/user"
install -m 755 ./anywhereToAgent "$HOME/.local/bin/anywhereToAgent"
install -m 644 deployment/anywhereToAgent.service "$HOME/.config/systemd/user/anywhereToAgent.service"
systemctl --user daemon-reload
systemctl --user enable --now anywhereToAgent
journalctl --user -u anywhereToAgent -n 50
```

用户退出后是否继续运行取决于服务器的 user lingering 策略，模板不修改该策略。程序无需 root 权限。

macOS 测试服务器模板：[com.anywheretoagent.service.plist.example](../deployment/com.anywheretoagent.service.plist.example)。替换 `__HOME__`，存为 `$HOME/Library/LaunchAgents/com.anywheretoagent.service.plist`，确保二进制和配置已放到模板指定位置：

```sh
mkdir -p "$HOME/Library/LaunchAgents"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.anywheretoagent.service.plist"
```

模板只运行中转，不启动本机 Agent。Mac 休眠、退出登录或关机会使该测试服务器不可用；正式中转建议部署在持续在线的服务器。

## Docker Compose（Linux）

[Dockerfile](../Dockerfile) 只包含 Go 中转二进制、系统 CA 和非 root 运行用户，无 Node.js、Codex CLI、SSH 客户端或项目挂载。Compose 使用 Linux `network_mode: host`，使管理监听继续绑定回环，反向代理在同一宿主机访问 `127.0.0.1:8080`。模板不以 Docker Desktop 的 host networking 为目标。

```sh
mkdir -p data/state
chmod 700 data/state
# 只修改本模板刚创建的专用目录。
sudo chown 10001:10001 data/state
export ANYWHERE_TO_AGENT_PUBLIC_URL=https://remote.example.com
docker compose build
docker compose up -d
docker compose logs --tail 50 anywheretoagent
```

将 `ANYWHERE_TO_AGENT_PUBLIC_URL` 替换为自己的入口；Compose 兼容原 `CODEX_REMOTE_PUBLIC_URL`，同时设置时新变量优先。可在项目外或忽略的 `.env` 中保存该非秘密值。状态仅挂载 `./data/state:/data`；不挂载用户项目、Codex home 或 Docker socket，不使用 privileged。宿主机反向代理配置同上。

独立管理入口仍为宿主机 `http://127.0.0.1:9090/admin/`；凭证在 `data/state/admin-token`。需要关闭新设备注册时，创建包含 `registration_enabled: false` 的 JSON 配置并挂载到容器，使用 `--config` 加载后重新创建服务。其它监听调整直接编辑 Compose 命令，确保管理端口仍为回环。

更新前备份私有状态，再重新构建/拉取和启动。`docker compose down` 不删除 bind mount 状态目录。当前开发环境没有 Docker，**镜像构建、容器启动和容器上的公网转发尚未实测**。

## 数据、迁移与排查

- `relay-state.json` 包含设备凭证哈希和私有浏览器授权 ID 映射，`admin-token` 为管理凭证；限制目录权限并备份。新授权映射不含原始授权 token 或加密密钥。服务器不持久化本机项目、Codex 登录、原生历史或工作区更改记录；应用层密文经过服务端内存转发。
- 从明文中转版本升级时，同时升级 Remote 与 agentTools，再让旧浏览器重新配对；旧明文配对、会话及文件 API 被拒绝，不会自动降级。中转启动时验证完整状态后原子清理旧原始 grant 映射，保留设备登记和有效加密授权；状态读取或校验失败时拒绝启动并保留原文件。升级前备份私有状态，迁移不删除本机 Codex 历史、附件或项目。
- 从早期“服务器直接执行 Codex”的测试版本迁移时，使用新的专用服务端数据目录，不把旧 Codex home、附件或项目拷到公网服务器。旧本机数据先保留备份，在客户端确认历史/附件可用后再清理。旧配对链接不代表新协议的长期浏览器授权，需要重新配对。
- `502`：检查中转进程、HTTPS 上游端口和 WebSocket 代理；仅操作本服务，不要重启无关网关。
- 客户端离线：检查电脑联网/休眠、服务 URL、证书、注册开关和设备登记；用户无需配置入站转发。自签名证书必须在客户端明确信任，不能关闭全局 TLS 校验。
- `403`：检查 URL 与 `public_url` 是否一致、Host 是否保留、浏览器授权是否过期或被客户端撤销；不要关闭来源/授权校验来绕过。
- `426` 或提示重新配对：确认 Remote 和 agentTools 均已升级，然后从客户端生成新码配对；不要恢复旧明文接口。
- 授权码失败：确认复制的是完整码、客户端在线、码未过期/未用过。重新生成只在客户端进行，服务端管理员不能代发授权。
- 历史缺失或文件打不开：在 agentTools 核对本机 Codex 数据目录和共享项目范围；不要在中转服务器寻找或配置这些文件。
- 输出最后一起出现：检查代理/CDN 缓冲及超时。中转只传送上游真实事件，不能补造 Codex 未发出的命令增量。

会话、文件和附件使用 AES-256-GCM 应用层端到端加密，并保留 HTTPS/WSS。配对秘密通过完整授权码或 URL fragment 交给浏览器，会话密钥与原始授权 token 经加密配对交付；中转不持有解密密钥。详见[架构与授权边界](architecture.md)。

中转仍可见设备及浏览器路由标识、设备名、连接状态、时间和密文大小。网页脚本由中转提供，浏览器密钥保存在同来源 localStorage；恶意替换脚本、同来源 XSS 或端点失陷仍能取得密钥。本方案防被动中转读取和状态文件泄漏，不承诺抵抗恶意网页服务器或具备前向保密；须继续保护可信 HTTPS 来源、静态资源、私有状态和备份。
