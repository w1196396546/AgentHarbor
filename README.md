# anywhereToAgent

agentTools 的独立公网中转服务和远程网页，访问由本机适配器提供的 Agent。网页按客户端声明的能力适配 Codex 和 Claude Desktop；具体执行支持由电脑端决定。在手机或另一台电脑打开网页，经过本机 agentTools 授权后，查看项目、历史会话并继续任务。

**agentTools 是客户端，anywhereToAgent 是服务器。** agentTools 主动连接中转服务，不要求电脑有公网 IP、开放入站端口或为每个用户配置 SSH。可以使用客户端预设的服务，也可以部署自己的 Remote。

```text
手机 / 浏览器 ── HTTPS ── anywhereToAgent ── 出站 WSS 连接 ── agentTools ── 本机 Agent
                           公网中转                         项目、会话、文件
```

## 文档导航

- [架构与授权边界](docs/architecture.md)：两端职责、加密协议、会话与兼容约定。
- [部署说明](docs/deploy.md)：配置、HTTPS、系统服务、Docker 和故障排查。
- [前端说明](web/README.md)：构建、组件生命周期和第三方许可。

## 使用

前提：电脑安装并运行 agentTools 和可用的本机 Agent；agentTools 登录 active 状态的 FullCupAI 账户，余额严格大于零。自部署中继也不取消客户端的账户校验，订阅不替代余额条件。

1. 在电脑的 agentTools 打开“远程连接”，选择预设服务或填写自己的 HTTPS 服务地址。
2. 勾选 Codex 或 Claude Desktop 卡片并分别连接，可同时启用两个 Agent。Codex 本机项目与 Claude Desktop 已有本地 Code 会话的项目自动同步，额外共享目录可选。Agent 配置、模型接入和项目文件都留在电脑上。
3. 在客户端生成授权码。手机扫描客户端显示的二维码，或在 Remote 网页输入完整授权码。
4. 配对成功后浏览器记住授权，有效期 30 天。客户端可以查看并随时撤销某个浏览器。
5. 保持电脑及 agentTools 运行、联网。在网页侧栏选择 Codex 或 Claude Desktop，再新建或选择历史会话并继续任务；后台使用本机适配器，不要求电脑打开对应聊天，也不自动切换桌面页面。当前 Codex 适配器支持模型/思考强度、计划模式、附件、工具、追问审批、文件预览、更改记录和流式输出。

远程网页默认使用后台会话能力：新建保留官方 thread ID；旧会话已有 App/VS Code owner 时跟随它，没有 owner 时在本机后台恢复同一 ID，发现不确定则拒绝接管并保留草稿。所有 Codex 入口仅使用经过验证的共享 App 服务；macOS / Windows 需从 agentTools 明确共享启动，正常运行后网页新建不会切换桌面聊天。用户退出 Codex 后不会被后台检查重新打开。原 App 专用工具和 UI 上下文是否可用取决于实际 owner，不承诺全部私有功能与官方远程一致。详见[会话执行说明](docs/architecture.md#后台会话执行与同步)。

历史使用本机官方索引和分页消息，详情先显示，不等待完整工具目录；新建返回后先进入会话，再刷新侧栏。连接失败可重试，创建已分配 ID 后不会自动另建会话或重发首条消息。旧客户端不提供后台能力时需更新 agentTools；网页不会自动回退到打开桌面聊天。

### Claude Desktop 原会话

在电脑端 agentTools 分别勾选、连接 Codex 与 Claude Desktop，完成各自本机连接。Claude Desktop 自动同步已有本地、非归档 Code 会话的项目，保留外置 worktree 与原项目的关联；尚无 Code 会话的目录可作为额外共享目录添加。网页侧栏显示两个 Agent 各自的连接中、已连接、已断开或不可用状态，单个故障不影响另一个。连接与重试在电脑端执行，网页不会启动桌面 App。网页继续走同一加密配对与中继，操作原 Desktop Code 会话；普通聊天和 Cowork 使用不同协议。

首次建立本机桥接、配对步骤和常见问题见 [Claude Desktop 使用说明](https://github.com/w1196396546/agenttools/blob/main/docs/claude-desktop-usage.md)。

网页适配多选问答、原生待审批计划的执行与修订、队列添加/取消/重排、附件和空会话创建防重。每项操作读取当前 owner 能力；未声明的中断、严格轮次 steer、同 ID 队列编辑、整体恢复和工具选择入口不会因此开放。新建 Desktop Code 会话按客户端声明默认为 Auto 自动审批；明确选择 Manual/default 时保留该选择，Auto 不等同于 Full access。现有会话权限保持原值；创建阶段暂不接受计划及其它权限模式，草稿保留。

创建请求回执按设备、Agent、项目保存在同标签页 sessionStorage；未知结果手工重试沿用同 UUID，不自动重复创建或发送。关闭浏览器会话或清除存储后，应先核对 Desktop 会话。协议见[原生队列与计划](web/README.md#native-owner-queue-and-pending-plans)。构建不等于部署或真实模型验收。

侧栏按“置顶、项目、最新、当前”分组，可独立折叠。“最新”按更新时间显示已加载会话，“当前”显示所选会话和客户端报告仍在执行或等待回复的会话；项目内和置顶会话可同时出现在时间列表中。标题和状态自动同步，搜索、项目筛选和“加载更多”继续生效。右侧工作区提供详情、文件、Diff、日志与产物，详情和日志仅展示已报告的数据，记录可跳回对话。手机端保留居中的“最新输出”、单行紧凑输入工具栏和可滚动导航。

授权码由客户端生成，单次使用、10 分钟过期；生成新码使旧码失效。设备 ID 只负责定位电脑，单有设备 ID 不能获得访问权限。浏览器授权由客户端签发并在每次请求时校验，中转服务不能自行批准访问。

网络短暂断开时客户端重连，正在执行的本机任务保留。手动断开远程连接或退出 agentTools 会关闭本机远程连接；原 App 持有的会话与共享服务任务继续运行。电脑需要保持运行和联网。

## 自己部署 Remote

服务器只运行 Go 中转服务、网页和服务端管理页，**不运行 Agent，不配置模型 API 密钥，也不挂载用户项目目录**。

```sh
make build
./anywhereToAgent \
  --data-dir "$HOME/.local/share/anywhereToAgent" \
  --listen 127.0.0.1:8080 \
  --public-url https://remote.example.com \
  --admin-listen 127.0.0.1:9090
```

使用自己的 HTTPS 域名和反向代理，将 WebSocket 和网页请求转到 `127.0.0.1:8080`；随后把该 HTTPS 地址填入 agentTools。“远程连接”页面不需要 SSH 主机或服务器密码。

打开 <http://127.0.0.1:9090/admin/>，用私有数据目录中的 `admin-token` 登录。管理页查看服务端监听、公网地址、新设备注册设置及运行状态，可撤销设备；修改服务配置后重启服务。共享项目、Agent 配置及浏览器授权在 **agentTools 客户端**管理。详见[部署说明](docs/deploy.md)和[架构与授权边界](docs/architecture.md)。

## 开发

需要 Go 1.26.8+ 和 Node.js 22.12+。前端使用 React 19、Vite、Tailwind CSS 4 和 Base UI，采用统一的明暗两种外观，源码位于 `web/`。`make build` 自动安装前端依赖并构建页面，再将静态资源嵌入 Go 二进制；服务器运行时无需 Node.js。

### 构建与本地启动

```sh
make build
# 使用独立临时状态，避免读写已有部署的数据目录。
relay_dev_dir="$(mktemp -d)"
./anywhereToAgent \
  --data-dir "$relay_dev_dir" \
  --listen 127.0.0.1:8080 \
  --public-url http://127.0.0.1:8080 \
  --admin-listen 127.0.0.1:9090
```

本地访问 [远程网页](http://127.0.0.1:8080/)；HTTP 仅用于回环开发，手机访问请配置 HTTPS。示例进程在前台运行，使用 Ctrl+C 停止；若端口已占用，选择空闲端口，并同步修改 `listen` 与 `public-url`，不要停止未知进程。临时目录包含管理凭证与测试授权，测试结束且不再需要后自行清理。

`make frontend` 只重建静态资源；`make build` 才会把新资源嵌入新二进制。修改 `web/src/` 后需同步生成 `internal/relay/assets/`，不要直接修改打包文件。构建完成不代表线上更新，部署还需替换实际运行的二进制并重启对应服务。

### 检查与测试

首次运行检查先执行 `npm ci`（`make build` 也会按需安装依赖），再按改动范围选择：

| 命令 | 检查范围 |
| --- | --- |
| `npm run typecheck` | 前端类型 |
| `make test` | Go 测试 |
| `make test-race` | Go 测试及数据竞争 |
| `make vet` | Go 静态检查 |
| `make test-ui` | 构建前端并运行 Node / Chromium / WebKit 回归 |

首次运行浏览器测试需执行 `npx playwright install chromium webkit`。`BROWSER=chromium make test-ui` 可只跑 Chromium 浏览器用例；Linux 安装系统依赖可用 `npx playwright install --with-deps chromium webkit`。测试使用隔离配置和本地假客户端，不需要生产凭证或真实模型调用。本机 Agent 执行与文件/计划协议测试位于 agentTools 的 `internal/remoteclient`，不属于服务器的运行依赖。

### 目录结构

| 路径 | 内容 |
| --- | --- |
| `cmd/anywhereToAgent/` | Go 程序入口与配置加载 |
| `internal/relay/` | 设备路由、授权映射、账户、管理和静态资源 |
| `internal/transport/tunnel/` | 有界 HTTP 流与 WebSocket 隧道 |
| `web/src/` | React 页面、共享组件、交互功能及加密传输 |
| `tests/` | Node / Playwright 回归与假客户端 |
| `deployment/` | 配置、代理及系统服务模板 |
| `docs/` | 架构、部署与专题说明 |

## 账户与管理权限

- `/account` 使用 FullCupAI 账户登录，管理该账户设备的名称和撤销；自部署设备绑定还要求浏览器已经与该设备配对。
- 账户登录不提供会话解密密钥，不替代每台电脑的浏览器授权；同一浏览器可以配对多台电脑并切换。
- `/admin/` 使用独立管理凭证，负责中继用户和设备管理，不能授权访问电脑项目。撤销设备会阻止原设备凭证重连；仅撤销某个浏览器请在 agentTools 操作。

## 常见问题

| 现象 | 优先检查 |
| --- | --- |
| 设备离线 | 电脑是否休眠、agentTools 是否运行、账户与余额、服务 URL / 证书、WebSocket 代理 |
| 配对失败 | 客户端在线、完整授权码、10 分钟有效期及是否已经使用；在客户端重新生成 |
| `403` | `public_url`、原始 Host / Origin、浏览器授权的到期与撤销；不要关闭校验 |
| `426` 或要求重新配对 | 两端版本是否匹配；一起升级后重新配对，不恢复明文接口 |
| 输出最后一起出现 | 反向代理 / CDN 缓冲和长连接超时 |
| 历史或文件缺失 | 客户端本机历史与允许访问的项目范围，不在中继配置项目路径 |
| 构建后页面未更新 | 是否重新编译并部署嵌入静态资源的 Go 二进制 |

`/healthz` 成功只表示中继 HTTP 可达。完整验收还需要真实客户端连接、浏览器配对、历史读取及流式任务；本地假客户端测试不能替代公网或实机验收。更多排查见 [部署说明](docs/deploy.md#数据迁移与排查)。

## 数据与边界

- 服务端只维护设备登记、凭证哈希、浏览器会话映射及管理配置；实际 Agent 配置、历史、附件和工作区记录在运行 agentTools 的电脑上。
- 会话、文件及附件使用 AES-256-GCM 端到端加密，配对秘密和会话密钥不交给中转；客户端与中转需一起升级并重新配对。网页代码仍由中转提供，须信任其静态资源，不能承诺抵抗恶意替换脚本。详见 [加密边界](docs/architecture.md)。
- 后台执行使用本机官方 app-server；已有原 owner 使用 App/VS Code follower 兼容层。内部协议受安装版本影响，不等同于 OpenAI 云端远程服务；不兼容或归属不确定时明确报错。上游未发送的命令增量、思考事件和私有 App 工具无法由中转补全。
- Dockerfile 和 Compose 是 Linux 自部署模板；仓库部署说明记录其镜像构建及容器运行尚未实测，使用前须在目标环境验收。

macOS / Windows 的共享 App 服务及明确启动由 agentTools 管理；无 GUI 连接端保留 `agentTools --remote-client [--config file.json] [--pair]`，同样要求已有经过验证的共享服务。Linux 无官方共享 App 服务时不再提供独立执行回退。具体能力依赖客户端和本机 App 版本，各平台仍需实机验收；中继服务器自身不运行 Agent。

## 许可证

[MIT 许可证](LICENSE)。前端保留 [Solid Glass 许可证](web/SOLID-GLASS-LICENSE)与[第三方声明](web/SOLID-GLASS-NOTICE.md)。
