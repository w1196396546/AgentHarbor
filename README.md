# anywhereToAgent

agentTools 的独立公网中转服务和远程网页，访问由本机适配器提供的 Agent。当前可用适配器为 Codex。在手机或另一台电脑打开网页，经过本机 agentTools 授权后，查看项目、历史会话并继续任务。

**agentTools 是客户端，anywhereToAgent 是服务器。** agentTools 主动连接中转服务，不要求电脑有公网 IP、开放入站端口或为每个用户配置 SSH。可以使用客户端预设的服务，也可以部署自己的 Remote。

```text
手机 / 浏览器 ── HTTPS ── anywhereToAgent ── 出站 WSS 连接 ── agentTools ── 本机 Agent
                           公网中转                         项目、会话、文件
```

## 使用

1. 在电脑的 agentTools 打开“远程连接”，选择预设服务或填写自己的 HTTPS 服务地址。
2. 选择允许远程访问的项目目录，点击连接。Agent 配置、模型接入和项目文件都留在电脑上。
3. 在客户端生成授权码。手机扫描客户端显示的二维码，或在 Remote 网页输入完整授权码。
4. 配对成功后浏览器记住授权，有效期 30 天。客户端可以查看并随时撤销某个浏览器。
5. 保持电脑及 agentTools 运行、联网。在网页新建或选择历史会话并继续任务；后台使用本机适配器，不要求电脑打开对应聊天，也不自动切换桌面页面。当前 Codex 适配器支持模型/思考强度、计划模式、附件、工具、追问审批、文件预览、更改记录和流式输出。

远程网页默认使用后台会话能力：新建保留官方 thread ID；旧会话已有 App/VS Code owner 时跟随它，没有 owner 时在本机后台恢复同一 ID，发现不确定则拒绝接管并保留草稿。无需为了网页新建退出 App 或改用共享启动。原 App 专用工具和 UI 上下文是否可用取决于实际 owner，不承诺全部私有功能与官方远程一致。详见[会话执行说明](docs/architecture.md#后台会话执行与同步)。

历史使用本机官方索引和分页消息，详情先显示，不等待完整工具目录；新建返回后先进入会话，再刷新侧栏。连接失败可重试，创建已分配 ID 后不会自动另建会话或重发首条消息。旧客户端不提供后台能力时需更新 agentTools；网页不会自动回退到打开桌面聊天。

授权码由客户端生成，单次使用、10 分钟过期；生成新码使旧码失效。设备 ID 只负责定位电脑，单有设备 ID 不能获得访问权限。浏览器授权由客户端签发并在每次请求时校验，中转服务不能自行批准访问。

网络短暂断开时客户端重连，正在执行的本机任务保留。手动断开远程连接或退出 agentTools 会关闭连接端自己的执行进程；原 App 持有的会话与共享服务任务继续运行。电脑需要保持运行和联网。

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

需要 Go 1.26.8+ 和 Node.js 22.12+。前端使用 React 19、Vite、Tailwind CSS 4 和 [Solid Glass](https://github.com/deeplethe/solid-glass)，源码位于 `web/`。`make build` 自动安装前端依赖并构建页面，再将静态资源嵌入 Go 二进制；服务器运行时无需 Node.js。

```sh
make build
npm run typecheck
make test
make test-race
make vet
npm ci
npx playwright install chromium webkit
make test-ui
```

`BROWSER=chromium make test-ui` 可只跑 Chromium。Linux 安装浏览器系统依赖可用 `npx playwright install --with-deps chromium webkit`。本机 Agent 执行与文件/计划协议测试位于 agentTools 的 `internal/remoteclient`，不属于服务器的运行依赖。

## 数据与边界

- 服务端只维护设备登记、凭证哈希、浏览器会话映射及管理配置；实际 Agent 配置、历史、附件和工作区记录在运行 agentTools 的电脑上。
- 会话、文件及附件使用 AES-256-GCM 端到端加密，配对秘密和会话密钥不交给中转；客户端与中转需一起升级并重新配对。网页代码仍由中转提供，须信任其静态资源，不能承诺抵抗恶意替换脚本。详见 [加密边界](docs/architecture.md)。
- 后台执行使用本机官方 app-server；已有原 owner 使用 App/VS Code follower 兼容层。内部协议受安装版本影响，不等同于 OpenAI 云端远程服务；不兼容或归属不确定时明确报错。上游未发送的命令增量、思考事件和私有 App 工具无法由中转补全。
- Dockerfile 和 Compose 是自部署模板；当前开发机无 Docker，镜像构建及容器运行尚未实测。

[MIT 许可证](LICENSE)保留上游版权声明。


macOS 的共享 App 启动器保留为可选兼容入口；Windows/Linux 后台会话使用相同 app-server 协议，仍需各平台实机验收。Linux 无 GUI 连接端使用 `agentTools --remote-client [--config file.json] [--pair]`，中转服务器自身不运行 Agent。
