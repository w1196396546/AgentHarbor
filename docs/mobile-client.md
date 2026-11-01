# 原生移动客户端落地方案

本文是 AgentHarbor 原生客户端（iOS / Android，可上架 App Store 与 Google Play）的施工文档，覆盖技术选型、服务端改造、客户端架构、加密实现、App Store 合规和分阶段交付。

本文描述的是**目标设计**，不是已完成的实现。文中所有涉及的协议细节都取自当前 checkout 的 `web/src/transport/secure.js`、`internal/relay/secure.go` 和 `internal/relay/pairing.go`；实现时必须逐条对照代码，协议以代码为准。

---

## 1. 决策

### 1.1 结论

| 维度 | 选择 |
| --- | --- |
| 框架 | **React Native + Expo（TypeScript）**，新架构（Fabric + TurboModules），Hermes 引擎 |
| 版本 | 实施时取 Expo 最新稳定 SDK；本文写作基线为 SDK 54 / RN 0.81，落地前按当时 LTS 复核 |
| 导航 | Expo Router（文件路由，支持深链与 Universal Links） |
| 构建分发 | EAS Build + EAS Update（OTA 热更新），TestFlight 内测 |
| 加密 | `react-native-quick-crypto`（JSI 原生 OpenSSL）为主，`@noble/ciphers` 为 Hermes 回退 |
| 存储 | `expo-secure-store`（Keychain / Android Keystore）+ 加密文件缓存 |
| 状态 | Zustand + TanStack Query（流式事件不走 Query，单独事件总线） |
| 设计系统 | Unistyles 或 NativeWind（二选一，见 3.3） |
| 最低系统 | iOS 16.0 / Android 10（API 29） |

> 版本号只作方向参考。RN 与 Expo 的大版本迭代很快，**开工第一天应重新确认订阅的 SDK 与 RN 组合**，不要照抄这里的数字。

### 1.2 为什么不是 Capacitor / PWA

PWA 与 Capacitor 复用成本最低，但本项目的核心场景是**手机上长时间流式阅读 + 频繁的审批交互**，这两点恰恰是 WebView 的短板：

- WebView 里滚动长 Markdown、Diff、工具调用卡片时，iOS WKWebView 的合成层内存会持续上涨，长会话容易触发 OOM 被杀；
- 后台切回时的流恢复依赖 `getReader()` 的存活，WebView 在内存压力下会静默挂起 reader；
- 推送、生物识别、扫码都要走桥接层，桥接层的失败模式比原生模块更难诊断；
- App Store 审核：纯 WebView 壳在 **4.2 Minimum Functionality** 下被拒的概率最高，而我们的差异化能力（原生推送、Face ID 解锁、扫码配对）本来就该用原生实现。

### 1.3 为什么不是 Flutter

Flutter 能做到同样的视觉与性能，但代价是**协议语义全部用 Dart 重写**。现有 `secure.js` 里有一批精细的边界处理（帧长上限 100 KB、8 MiB 事件缓冲、`archived` 事件终止流、`Last-Event-ID` 续接、`permanent` 与 `retryable` 的错误分流），逐条翻译到 Dart 等于重做一次安全实现，且无法共用测试向量。RN 可以和现有前端共享 TypeScript 的协议层与类型定义。

### 1.4 重写边界

**保留，不重写**：

- Go relay 全部逻辑（`internal/relay`、`internal/transport/tunnel`）；
- agentTools 客户端与电脑端适配器（不在本仓库）；
- 加密协议、隧道协议、会话协议、SSE 事件协议；
- `web/src/` 保留给浏览器用户，两条客户端长期并存。

**重写**：

- 全部界面（`web/src/views`、`components/ui`、`styles/`）；
- 传输层（新增 `app/packages/protocol`，语义对齐 `secure.js`）；
- 状态管理与设备/会话生命周期（对齐 `controller.jsx` 与 `features/`）。

**新增**：

- relay 的 Bearer 会话通道（第 4 节）；
- 原生推送投递（第 7 节）。

---

## 2. 目标架构

```
┌──────────────────────────────────────────────────────────┐
│  AgentHarbor App (iOS 16+ / Android 10+)                 │
│                                                          │
│  app/                 Expo Router 路由与屏幕              │
│  packages/protocol/   加密、NDJSON 帧、SSE 重建（纯 TS）   │
│  packages/api/        会话/线程/文件/队列 typed client     │
│  packages/design/     设计 token 与基础组件                │
│  packages/native/     SecureStore / Biometrics / Camera   │
│                                                          │
│  Keychain / Keystore ── 会话 token + 会话密钥 + 设备列表    │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTPS  Authorization: Bearer
                ┌───────▼────────┐
                │  AgentHarbor   │  + Bearer 会话 + 推送投递
                └───────┬────────┘
                        │ 出站 WSS
                ┌───────▼────────┐
                │   agentTools   │
                └────────────────┘
```

关键约束：**App 不持有任何明文长期凭据之外的东西**。relay 依然只转发密文，握手、请求、响应、事件全部在 App 与电脑之间端到端加密，协议与浏览器客户端完全一致。

---

## 3. 客户端工程结构

### 3.1 Monorepo 布局

建议在仓库根目录新增 `app/`，与 `web/` 平级，两套构建互不干扰：

```
app/
├── app.json
├── eas.json
├── package.json
├── tsconfig.json
├── app/                        # Expo Router
│   ├── _layout.tsx             # 根布局：主题、解锁门、深链
│   ├── (auth)/
│   │   ├── index.tsx           # 欢迎页
│   │   ├── pair.tsx            # 二维码扫描 / 手动输入
│   │   └── devices.tsx         # 已配对电脑列表（≤16）
│   ├── (main)/
│   │   ├── _layout.tsx         # 抽屉 + 会话栈
│   │   ├── index.tsx           # 会话列表（置顶/项目/最新/当前）
│   │   └── thread/[id].tsx     # 会话详情
│   └── inspect/[id]/
│       ├── files.tsx
│       ├── diff.tsx
│       ├── logs.tsx
│       └── artifacts.tsx
├── packages/
│   ├── protocol/
│   │   ├── crypto.ts           # HKDF + AES-GCM，与 secure.js 逐字节等价
│   │   ├── envelope.ts         # head/data/end 帧编解码
│   │   ├── stream.ts           # NDJSON 与 SSE 解析器
│   │   ├── events.ts           # Last-Event-ID 续接与退避
│   │   └── __fixtures__/       # 与浏览器端共用的测试向量
│   ├── api/
│   │   ├── client.ts           # secureFetch 等价物
│   │   ├── sessions.ts
│   │   ├── threads.ts
│   │   └── types.ts            # 从 web/src 提炼的共享类型
│   ├── design/
│   └── native/
├── ios/                        # prebuild 产物，不入库
├── android/
└── assets/
```

### 3.2 依赖清单

```json
{
  "dependencies": {
    "expo": "~54.0.0",
    "expo-router": "~6.0.0",
    "react": "19.1.0",
    "react-native": "0.81.x",
    "react-native-quick-crypto": "^0.7.x",
    "@noble/ciphers": "^2.0.0",
    "@noble/hashes": "^2.0.0",
    "expo-secure-store": "~15.0.0",
    "expo-local-authentication": "~17.0.0",
    "expo-camera": "~17.0.0",
    "expo-notifications": "~0.32.0",
    "expo-file-system": "~19.0.0",
    "expo-document-picker": "~14.0.0",
    "expo-image-picker": "~17.0.0",
    "expo-haptics": "~15.0.0",
    "react-native-keyboard-controller": "^1.14",
    "react-native-reanimated": "~4.0.0",
    "react-native-gesture-handler": "~2.28.0",
    "react-native-svg": "15.x",
    "@shopify/flash-list": "^2.0.0",
    "zustand": "^5.0.0",
    "@tanstack/react-query": "^5.60.0"
  }
}
```

### 3.3 渲染与设计系统

**Markdown 与 Diff 必须用原生渲染**，这是与 WebView 方案拉开差距的地方：

- Markdown：`react-native-marked` 或自建 `unified` → 原生组件映射。**不要用 react-native-webview 渲染 Markdown**，长会话会退化成本方案的短板。
- 代码块：`react-native-syntax-highlighter` + 自建只读高亮，长代码块按 200 行切块并默认折叠。
- Diff：`diff` 包解析成 hunk 结构后渲染为 `FlatList`，按 hunk 虚拟化，两侧行号与状态色沿用现有 token。

**设计 token 直接搬** `web/src/styles/tokens.css`：把 CSS 变量中的颜色、圆角、间距、字号提取为 TS 常量与 `Unistyles` 主题。明暗两套值已经是完整体系，不要重新设计。

**样式方案取舍**：

| 方案 | 优点 | 缺点 | 建议 |
| --- | --- | --- | --- |
| Unistyles 3 | 运行时主题切换、C++ 层提高性能 | 生态较新 | **推荐**，明暗切换频繁 |
| NativeWind 4 | 与 Tailwind 语法一致，Web 端作者上手快 | 主题切换需重编译，动态样式有边界 | 团队有 Tailwind 经验时可选 |

### 3.4 界面结构

```
抽屉（左滑打开）
├── 顶部：当前电脑 + 连接状态
├── 置顶
├── 项目（每个项目带新建按钮）
├── 最新
├── 当前（执行中 / 等待回复）
└── 底部：设备切换、账户、设置

会话详情
├── 顶部导航：返回 / 标题 / 项目·分支 / 更多
├── 消息流（FlashList，倒序虚拟化）
│   ├── 用户气泡
│   ├── Agent 消息（Markdown / 工具卡片 / 推理折叠）
│   ├── 审批卡（内联，展开为 Bottom Sheet）
│   └── 追问卡（多选/单选/自由文本）
├── 底部：项目·分支行 + 输入栏
│   └── 输入栏：附件 / 模型·思考强度 / 审批模式 / 发送·停止
└── 检查器入口：文件 / Diff / 日志 / 产物（全屏 sheet）
```

**移动端专项要点**：

1. **键盘**：`react-native-keyboard-controller` 的 `KeyboardAvoidingView` + `KeyboardAwareScrollView`，不用 `KeyboardAvoidingView` 的系统默认值（Android 上会抖动）。
2. **安全区**：所有固定定位元素使用 `useSafeAreaInsets`，底部输入栏 `paddingBottom = max(12, insets.bottom)`，对齐现有 `env(safe-area-inset-bottom)` 的行为。
3. **流式跟随**：仅在用户位于底部 120 px 内时跟随滚动；用户上滑阅读时暂停跟随并显示"回到最新"按钮。
4. **长按操作**：消息长按 → `ContextMenu`（复制、引用、查看原始 JSON）；工具卡片长按 → 查看详情。
5. **触感反馈**：审批确认、发送、配对成功使用 `expo-haptics` 的 `notificationAsync`。不要滥用 `impactAsync`。

---

## 4. 服务端改造（Go）

这是整个方案唯一必须改服务端的部分，且改动是**加法**，浏览器路径完全不受影响。

### 4.1 为什么必须改

原生端无法读取 HttpOnly cookie，而 [secure.go:24](internal/relay/secure.go:24) 是这样定位会话的：

```go
cookie, _, _ := s.sessionCookie(r)
key := digest(cookie.Value)
```

`sessions.go:44` 写入的是 `HttpOnly: true, SameSite: SameSiteStrictMode`，App 的 fetch 拿不到。直接放开 SameSite 也不行：native fetch 根本不共享 cookie jar。

### 4.2 设计：Bearer 通道

关键事实：**这个 token 是 relay 自己签发的**。`pairing.go:102` 的 `randomToken(32)` 生成 64 位 hex，`pairing.go:133` 以 `digest(cookie)` 为键写入 `Sessions`。它通过 `Set-Cookie` 交给浏览器，从来没有出现在响应 body 里。

所以改造完全在 relay 侧，**不依赖 agentTools 发版**：

1. 配对响应体里额外返回这个 token，但**只对声明为原生客户端的请求返回**；
2. 后续请求允许从 `Authorization: Bearer <token>` 取 token。

两条通道共用同一个 `Sessions` map、同一套过期与撤销逻辑、同一个 `cancelRequests`，语义完全等价。

### 4.3 具体改动

**(a) `internal/relay/sessions.go` 增加 token 解析**

```go
// bearerToken returns the raw session token presented by a native client.
func bearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if len(header) <= len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return ""
	}
	value := strings.TrimSpace(header[len(prefix):])
	if !validHex(value, 64) {
		return ""
	}
	return value
}

// sessionKey resolves the storage key for either transport.
// Returns "" when neither transports a usable token.
func (s *Server) sessionKey(r *http.Request) string {
	if token := bearerToken(r); token != "" {
		return digest(token)
	}
	cookie, _, err := s.sessionCookie(r)
	if err != nil || !validHex(cookie.Value, 64) {
		return ""
	}
	return digest(cookie.Value)
}
```

`sessions.go:94` 的 `session()` 当前假设 cookie 必定存在（`validHex(cookie.Value, 64)` 直接解引用）。改成上面的空串约定后，调用方必须把 `""` 当作"未授权"处理，**不要**让空串进到 `Sessions[""]` 里误命中。

然后把**浏览器会话**（不是账户会话）的所有 `digest(cookie.Value)` 调用改为 `s.sessionKey(r)`。当前共 4 处，逐条确认：

| 位置 | 用途 | 是否改 |
| --- | --- | --- |
| `secure.go:35` | `/api/secure` 定位会话 | 必须改 |
| `sessions.go:76` | `browserCookies` 枚举（仅配对时用） | 不改，保持 cookie |
| `sessions.go:94` | `session()` 读会话 | 必须改 |
| `sessions.go:108` | `logout()` 删会话 | 必须改 |
| `users.go:270` | `claimAccountDevice` 校验已配对设备 | 必须改 |
| `users.go:146`、`users.go:222` | **账户**会话（`AccountSessions`） | 不改，见 8.4 |

`logout` 需要同时处理两种情况：Bearer 直接删 `Sessions[key]` 并返回 204；cookie 仍走原有清 cookie 分支。注意 Bearer 路径下没有 cookie 可清，`clearCookie` 调用要跳过。

**(b) `internal/relay/pairing.go` 有条件地回传 token**

在 `pairing.go:160` 的最终 `jsonReply` 里增加一个字段，**仅当请求声明为原生客户端时**：

```go
reply := map[string]any{
    "paired": true, "device_id": id, "id": result.ID,
    "sealed": result.Sealed, "expires_at": result.ExpiresAt,
}
if r.Header.Get("X-Remote-Native") == "1" {
    reply["native_token"] = cookie
}
jsonReply(w, http.StatusOK, reply)
```

**为什么必须加这个门**：浏览器端页面由 relay 提供，拿到 token 就等于绕过 HttpOnly 的保护。`X-Remote-Native` 是自定义头，浏览器跨源发它会触发预检，而预检的 `Origin` 会命中 `http.go:86` 的严格比较直接 403——所以网页脚本无法通过这个门。同时 `secure.js` 的 `validSession` 只按白名单取字段，多出来的 `native_token` 对浏览器无影响。

**(c) 不需要改的地方**

- `sealed` 载荷结构不变，agentTools 无需发版；
- `pairResponse` 的形状校验不变（token 在 `Sessions` 里生成，不经过电脑端）；
- 持久化 schema 不变：`Sessions[digest(token)]` 与 cookie 完全同构，只是同一个值换了传输方式。

**(d) 撤销路径必须覆盖到**

`agentTools` 侧"撤销浏览器"会调到 relay 的会话删除逻辑；App 侧"移除这台电脑"应调用 `POST /api/logout` 带 Bearer，走 `sessions.go:99` 的同一个删除分支。两边都必须真正删掉 `Sessions[key]`，否则 token 在过期前（30 天）仍然有效。**这是最容易漏的一条**。

**(e) 请求头**

原生端每个 `/api/secure` 请求带：

```
Authorization: Bearer <token>
X-Remote-Request: 1
X-Remote-Agent: <agent id>
X-Remote-Owner-Epoch: <epoch>
Content-Type: application/json
```

`X-Remote-Request: 1` 是必需的——[http.go:105](internal/relay/http.go:105) 对所有非 GET 请求强制要求该标记，否则返回 403。

**不要**带 `Origin`。带了就要命中 `http.go:86` 的严格等值比较，会和 `public_url` 冲突。

**(e) `X-Remote-Device`**

多设备场景下 App 用 Bearer token 天然区分设备（每个 token 属于一台设备），不需要 `X-Remote-Device`。该头只在浏览器共享 cookie jar 的场景有意义。

**(f) 限流**

`allowAttempt("pair", clientIP, 12)` 按 IP 计数。移动网络大量用户共用运营商 NAT 出口，12 次/分钟会误伤。建议：

```go
limit := 12
if r.Header.Get("X-Remote-Native") == "1" {
    limit = 60  // 原生端已持有设备凭证,配对是用户主动行为
}
```

`X-Remote-Native: 1` 只是放宽容量的提示，不构成信任，仍受 token 有效性约束。

### 4.4 服务端测试清单

| 用例 | 期望 |
| --- | --- |
| Bearer 请求 `/api/secure` | 与 cookie 会话行为一致 |
| Bearer token 过期 | 401，消息与浏览器一致 |
| 电脑端撤销该浏览器 | Bearer 后续请求 401 |
| 同一 token 并发流式请求 | 均正常，互不取消 |
| `logout` 走 Bearer | 删除会话记录，不影响同设备其它 token |
| cookie 路径回归 | `device_sessions_test.go` 全绿 |
| 无 `X-Remote-Request` 的 POST | 403 不变 |
| 带 `Origin` 的原生请求 | 403 不变（明确非目标行为） |

---

## 5. 加密与传输实现

### 5.1 密码学常量（必须与浏览器端逐字节一致）

摘自 [secure.js](web/src/transport/secure.js)：

| 项 | 值 |
| --- | --- |
| KDF | HKDF-SHA-256 |
| HKDF salt | `unhex(id, 16)`（16 字节） |
| HKDF info | `"agentTools remote e2ee v1 " + purpose` |
| 派生密钥 | AES-256-GCM，不可导出 |
| IV | 12 字节全零，后 8 字节写入 `BigUint64(sequence)`（大端），偏移 4 |
| AAD | `"agentTools/remote/e2ee/v1|" + purpose + "|" + id + "|" + sequence` |
| Tag 长度 | 128 位 |
| purpose 取值 | `pairing`、`paired`、`request`、`response` |
| 载荷编码 | JSON → UTF-8 → AES-GCM → Base64（标准字母表，带 padding） |

`id` 为 16 字节 hex（32 字符），`secret` 为 32 字节 hex（64 字符）。

### 5.2 RN 端实现

```ts
// packages/protocol/crypto.ts
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { gcm } from '@noble/ciphers/aes';
import { utf8ToBytes } from '@noble/ciphers/utils';

const info = (purpose: string) =>
  utf8ToBytes('agentTools remote e2ee v1 ' + purpose);

function derive(secret: Uint8Array, id: Uint8Array, purpose: string): Uint8Array {
  return hkdf(sha256, secret, id, info(purpose), 32);
}

function params(id: string, purpose: string, sequence: number) {
  const iv = new Uint8Array(12);
  new DataView(iv.buffer).setBigUint64(4, BigInt(sequence));
  return {
    keyArgs: { id, purpose },
    aad: utf8ToBytes(`agentTools/remote/e2ee/v1|${purpose}|${id}|${sequence}`),
    iv,
  };
}

export function seal(secret: string, id: string, purpose: string, value: unknown): string {
  const { iv, aad } = params(id, purpose, 0);
  const key = derive(unhex(secret), unhex(id), purpose);
  const plaintext = utf8ToBytes(JSON.stringify(value));
  return base64(gcm(key, iv, aad).encrypt(plaintext));
}

export function open(secret: string, id: string, purpose: string, sequence: number, data: string): unknown {
  const { iv, aad } = params(id, purpose, sequence);
  const key = derive(unhex(secret), unhex(id), purpose);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true })
      .decode(gcm(key, iv, aad).decrypt(unbase64(data))));
  } catch {
    throw new SecureInvalidError('Encrypted connection could not be verified.');
  }
}
```

**性能策略**：`@noble/ciphers` 是纯 JS，Hermes 上单次 20 MiB 解密大约 1.5–3 秒（取决于设备）。因此：

1. 优先用 `react-native-quick-crypto` 的 `createCipheriv('aes-256-gcm')`，走原生 OpenSSL；
2. 启动时做一次能力探测，失败则回退 noble 并在设置页显示"当前设备加密加速不可用"；
3. **文件下载不整体解密**：按 1 MiB 分块（每块独立 seq），分块写入 `FileSystem` 后拼接。这样内存峰值可控，进度也可显示。

> 注意：`@noble/ciphers` 在 Hermes 上不需要 `crypto.getRandomValues`（我们只用固定 IV），但**配对时生成 `id` 与 `session_key` 需要安全随机数**，必须用 `expo-crypto` 的 `getRandomBytes`。绝不使用 `Math.random`。

### 5.3 请求与响应帧

请求体（与 `secureFetch` 一致）：

```ts
{
  grant: string,          // 电脑签发
  method: string,
  url: string,            // "/api/" + path
  header: Record<string, string[]>,
  body: string,           // base64
  expires_at: number,     // Date.now() + 120000
}
```

外层请求：`POST /api/secure`，body `{ id: <32 hex>, data: <base64> }`。

响应是 `application/x-ndjson`，逐行：

```json
{"data":"<base64 ciphertext>"}
```

解密后依次得到：

```json
{"type":"head","status":200,"header":{...}}
{"type":"data","data":"<base64 body chunk>"}
{"type":"end"}
```

**实现必须保持的边界**（逐条对齐 `secure.js`）：

| 检查 | 值 |
| --- | --- |
| 单行长度上限 | 100 000 字符 |
| 请求体上限 | 21 MiB（客户端）、48 MiB（relay） |
| 帧字段数 | 必须恰好 1 个键 `data` |
| 204/205/304 | 返回空 body，且不得有 data 帧 |
| 结束校验 | `pending` 必须为空，且 reader 已 done |

### 5.4 SSE 事件流

`secureFetch` + `Accept: text/event-stream`，解密后按 SSE 语法解析。关键行为：

- `Last-Event-ID` 在密文内传递，续接语义由电脑端决定；
- 退避 500 ms 起，翻倍至 10 s 上限；
- 收到 `archived` 或 `unavailable` 事件立即关闭；
- 4xx 与加密校验失败为**永久错误**，不重试；
- 5xx 与网络错误可重试；
- 事件缓冲上限 8 MiB，超限视为完整性失败。

**App 生命周期**：进入后台时保留流 5 秒后主动关闭（iOS 后台网络会在 30 秒内被系统挂起）；回到前台立即重建流并带 `Last-Event-ID`，**不要复用旧 reader**。

### 5.5 测试向量（最重要的一条）

在 `packages/protocol/__fixtures__/` 放置一组固定的 (secret, id, purpose, sequence, plaintext, ciphertext) 六元组，来源是从 `secure.js` 实际运行产出的结果。RN 端与 Go 端测试都读同一份 JSON。

**这组向量是跨端兼容的唯一事实来源。** 任何加密实现改动都必须先过它。

---

## 6. 凭据与设备存储

### 6.1 存储分层

| 数据 | 位置 | 说明 |
| --- | --- | --- |
| `session_token`、`session_key` | `SecureStore`，`WHEN_UNLOCKED_THIS_DEVICE_ONLY` | 绝不同步 iCloud |
| `grant`、`expires_at` | 加密文件 | 密文用 SecureStore 里的主密钥保护 |
| 设备列表（≤16） | 加密文件 | 结构对齐 `devicesKey` |
| 草稿、创建请求 UUID | MMKV 明文 | 不含凭据与正文 |
| 消息缓存 | 不缓存 | 见 6.3 |

Android 的 `SecureStore` 背后是 Keystore 包装的 AES-GCM；iOS 是 Keychain。**不要**把 token 放进 AsyncStorage（明文、可备份）。

### 6.2 结构体

```ts
type DeviceRecord = {
  deviceId: string;          // 32 hex
  token: string;             // 64 hex，Bearer
  grant: string;             // 32 hex
  secret: string;            // 64 hex，session_key
  expiresAt: string;         // ISO
  name: string;              // 用户可改
  pairedAt: string;
};
```

上限 16 台，超限时引导用户在配对页先移除一台。

### 6.3 缓存策略

**不持久化解密后的消息正文。** 理由：解密正文落盘后，App 侧的 E2EE 保证就退化成了设备完整性保证，而设备可能被越狱、被备份、被取证。选择：

- 会话列表（标题、项目、时间、状态）：可缓存密文，启动后解密显示骨架；
- 消息正文：仅在内存，切后台 5 分钟后丢弃；
- 附件：下载到 `FileSystem.cacheDirectory`，标记 `excludeFromBackup`，启动时清理超过 24 小时的文件。

如果后续确实需要离线阅读，正确做法是让电脑端签发**独立的离线快照密钥**，而不是在 App 里放松约束。

### 6.4 解锁门

- 回前台超过 **3 分钟** 要求 `Face ID / 指纹`（`expo-local-authentication`，`biometricsSecurityLevel: 'biometric'`）；
- 认证失败**不销毁** token，只锁界面，提供"重新配对"入口；
- 设置页可关闭（用户自担风险），默认开启；
- iOS 上同时开启 `UIApplication.isProtectedDataAvailable` 检查，设备未解锁时不访问 Keychain。

---

## 7. 配对与推送

### 7.1 配对流程

现有二维码内容格式是 `设备ID.授权码`（`secure.js:99` 按 `.` 切分，前段 32 hex，后段 64 hex）。

```
agentTools 显示二维码
        ↓ expo-camera 扫描
解析 "deviceId.secret"
        ↓
生成 id = random(16), sessionKey = random(32)
        ↓
seal(secret, id, 'pairing', {
   code: fullCode,
   name: Device.modelName,
   session_key: sessionKey,
   platform: 'ios' | 'android'
})
        ↓
POST /api/pair  { device_id, id, data }
        ↓
open(secret, id, 'paired', 0, sealed.data)
  → { id, grant, expires_at, session_token }
        ↓
写入 SecureStore
```

**必须实现的三条防御**：

1. 二维码内容严格校验正则 `^[a-f0-9]{32}\.[a-f0-9]{64}$`，失败立即拒绝并提示；
2. 配对成功后立即 `camera.stop()` 并跳转，避免重复提交（配对码单次有效）；
3. `sealed` 里没有 `session_token` → 明确提示升级 agentTools，**不降级**。

**深链兜底**：`agentharbor://pair?code=<...>`，用于扫码失败或从电脑端分享链接的场景。二维码与深链共用同一解析函数。

**名字长度**：relay 会把 `User-Agent` 截断到 128 字节并做 UTF-8 安全截断。原生端不发 UA，改用 `{ platform: 'ios', model: 'iPhone 16 Pro' }` 显式字段，长度控制在 128 字符内。

### 7.2 推送架构

**推送内容不得包含任何明文业务信息。** relay 看不到会话标题，也不应该看到。

方案：**电脑端加密摘要**。

```
配对时协商：独立 32 字节 notification_key（放进 sealed 载荷）
电脑端在以下事件发生时生成推送：
  - pending_plan_approval 出现
  - turn 结束且会话在前台超过 60 秒无活动
  - 追问（ask）出现
摘要结构：
{ "kind": "approval" | "done" | "question",
  "thread_id": "<id>",
  "title": "<会话标题，≤64 字节>" }
→ AES-256-GCM(notification_key) → base64
→ 作为 APNs/FCM 自定义字段 "p"
```

relay 只负责把不透明字符串投递出去。

**注册流程**：

```
App 启动 → 请求通知权限 → 拿到 Expo Push Token
→ POST /api/secure { method: POST, url: "/api/notifications",
                     header: {"Content-Type":["application/json"]},
                     body: base64({ token: "ExponentPushToken[...]", platform: "ios" }) }
```

注意：**该端点由 agentTools 实现，写入本机（用户电脑），不是 relay**。relay 不持有 push token，投递由电脑端通过 Expo Push API 直接发出。这样 relay 的知识面不增加任何一项。

**推送点击**：携带 `thread_id` 明文（不含内容），App 冷启动后先解锁，再用 Buffer 中的密文摘要校验，然后正常拉取会话。

### 7.3 后台任务

iOS 的背景执行能力有限，不做"后台持续收流"。只做：

- 静默推送（`content-available: 1`）最多 30 秒处理窗口，用于刷新会话列表的密文快照；
- 用户主动打开 App 时全量恢复。

---

## 8. App Store 合规

### 8.1 审核风险与对策

| 风险 | 条款 | 对策 |
| --- | --- | --- |
| 纯壳应用被拒 | 4.2 Minimum Functionality | 原生推送、Face ID、扫码配对、原生 Markdown/Diff 渲染、离线骨架——登记为"原生能力清单" |
| 隐私描述不实 | 5.1.1 | 见 8.2，逐项填写并保持与代码一致 |
| 加密出口合规 | EAR | 见 8.3 |
| 多设备账号 | 5.1.1(v) | 本 App 是"遥控自己的电脑"，不属于社交/多租户账号体系；账户登录走 `SFSafariViewController` 式的外部浏览器 |
| 后台持续执行 | 2.5.4 | 不申请 `audio` / `location` 等后台模式 |

### 8.2 权限与隐私清单

| 能力 | Android 权限 | iOS `Info.plist` |
| --- | --- | --- |
| 相机（扫码配对） | `CAMERA` | `NSCameraUsageDescription` |
| 相册（附件） | `READ_MEDIA_IMAGES`（Android 13+） | `NSPhotoLibraryUsageDescription` |
| 文件（附件） | 无（SAF） | `NSDocumentsFolderUsageDescription`（如启用） |
| 通知 | `POST_NOTIFICATIONS`（13+） | 系统运行时请求 |
| 生物识别 | `USE_BIOMETRIC` | `NSFaceIDUsageDescription` |

**必须做的**：

- `PrivacyInfo.xcprivacy`：声明 `UserDefaults`、文件时间戳、磁盘空间的 Required Reason API 使用；
- Google Play Data Safety 表单：一律选"不收集、不共享"，本 App 不向任何第三方发送数据；
- 隐私政策链接：必须与真实行为一致——**手机端不保存解密正文**这一点要写进去。

### 8.3 加密出口合规

使用 `ITSAppUsesNonExemptEncryption`。本 App 只使用标准算法（AES-256-GCM、HKDF-SHA-256、TLS），且加密仅用于自身通信，属于 EAR 的"非豁免"中的**豁免情形**（mass-market encryption）。填 `false` 并在提交时选择对应豁免类别。**建议在上架前请法务确认**，不同司法辖区结论不同。

### 8.4 账号登录

`/account`（FullCupAI 账户）在 App 内**不要用 WebView 承载密码输入**：

- 用 `expo-web-browser` 打开系统浏览器（iOS `SFSafariViewController`，Android Custom Tabs）；
- 通过 `agentharbor://account/callback` 回调；
- 现有 `/account` 页面使用 **12 小时 HttpOnly + SameSite=Strict** 的账户会话，跨浏览器共享，天然满足"可登录、可登出"的审核要求。

**另一个必须注意**：审核员没有你的电脑，无法完成配对。审核说明里必须提供**演示模式**：

```
提供一段内建的示例会话（本地假数据，走同一套渲染组件），
在配对页提供 "Try the demo" 入口。
```

这不是可选项——没有演示路径，4.2 与"无法评估功能"两条会同时命中。

---

## 9. 分阶段交付

| 阶段 | 交付物 | 验收标准 | 预估 |
| --- | --- | --- | --- |
| M0 协议冻结 | `packages/protocol` + 测试向量 | 与 `secure.js` 产出逐字节相同；Go 端交叉验证通过 | 1 周 |
| M1 骨架 | 配对、设备列表、会话列表（只读） | 真机扫码配对成功，列表数据来自真实电脑 | 2 周 |
| M2 会话 | 消息流、流式渲染、Markdown/Diff、检查器 | 长会话（500+ 消息）滚动 60 fps，流式无卡顿 | 3 周 |
| M3 交互 | 输入栏、审批、追问、队列、附件、项目/分支 | 与浏览器端功能对齐矩阵全部通过 | 3 周 |
| M4 原生 | 推送、Face ID、深链、分享、Haptics | 通知点击直达审批卡；冷启动 3 秒内可操作 | 2 周 |
| M5 合规 | 隐私清单、演示模式、商店素材、TestFlight | 内部 20 人试用无阻断问题 | 2 周 |
| M6 上架 | App Store + Google Play | 审核通过 | 2–6 周（不可控） |

**M0 是硬性门槛**：加密向量不过，后面全部作废。

### 9.1 功能对齐矩阵（M3 验收用）

| 功能 | 浏览器 | App | 备注 |
| --- | --- | --- | --- |
| 多 Agent 切换 | ✅ | 必须 | `X-Remote-Agent` |
| 项目 / 分支创建 | ✅ | 必须 | `workspace_git` 能力 |
| 无项目创建 | ✅ | 必须 | `projectless_creation` |
| 队列增删改重排 | ✅ | 必须 | 细分能力逐项判断 |
| 原生计划审批与修订 | ✅ | 必须 | `execute-plan` / `revise-plan` |
| 追问多选 | ✅ | 必须 | |
| 附件上传 | ✅ | 必须 | 20 MiB |
| 文件预览 / Diff / 日志 | ✅ | 必须 | |
| 子 Agent 图谱 | ✅ | 可选 | |
| 搜索 | ✅ | 必须 | |
| 账户页 | ✅ | 外部浏览器 | 不内嵌 |

---

## 10. 风险清单

1. **agentTools 必须先发版**：`session_token` 字段不在 relay 侧，App 与 agentTools 有跨仓库发布顺序依赖。建议 agentTools 先发一个"字段存在但浏览器不用"的版本，观察一个周期后再发 App。
2. **旧浏览器不受影响，但旧 agentTools 不支持 App**：版本矩阵必须写进 App 的配对错误页。
3. **`@noble/ciphers` 在低端 Android 上偏慢**：必须实测 `react-native-quick-crypto` 在目标机型上可用，否则 20 MiB 附件体验不可接受。
4. **自部署用户的 TLS**：不做证书 pinning。用户填写任意 HTTPS 地址，App 依赖系统信任链。这与浏览器端一致，但要在设置页明确提示风险。
5. **推送依赖 Expo 推送服务**：如果介意第三方（Expo 能看到设备 token 和推送时间，但看不到内容），改为直连 APNs/FCM，代价是额外维护一套凭据。**内容已经端到端加密，Expo 可接触的信息量很小**，建议先用 Expo。
6. **iOS 后台流被挂断**：用户可能以为"任务停了"。UI 必须在流断开时显示"正在等待你的电脑"，而不是"执行失败"。
7. **`Sessions` map 无 per-token 计数**：同一设备多次配对会累积会话记录，最终受 16 台上限约束的是浏览器侧。App 侧要自己维护设备列表并在移除时调用 `logout`。

---

## 11. 与现有文档的关系

- 加密协议与授权边界以 [architecture.md](architecture.md) 为准；本文只描述客户端侧实现。
- 浏览器端行为以 [web/README.md](../web/README.md) 为准，本方案不改动它。
- 本文不宣称任何功能已实现。M0 的测试向量、M1 的真机配对、M6 的商店审核都必须在目标环境重新验收，不能引用历史通过数。
