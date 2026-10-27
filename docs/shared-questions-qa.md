# 共享 App 提问兼容验收记录（2026-10-21）

实现完成，用户已批准直接合并、处理冲突并删除本次 worktree。本次合并按用户要求不运行任何测试；下方检查均为合并前记录。未推送、部署、打包或替换安装应用。

## 记录范围与后续复验

本文保留 2026-10-21 该项改动合并前的结果，不代表当前分支或线上状态。2026-10-21 的文档补充没有重新运行测试，也没有重新确认下述开放问题是否已经修复；“待修正”等状态均指当时记录。

下方工作树路径、基线提交与分支用于定位历史上下文，不是当前工作目录；工作树已按当时合并流程删除，不保证分支仍存在。`/tmp/` 日志、截图及旧资源副本属于临时证据，可能已清理，不能作为可长期下载的交付物。

后续修复应追加对应提交、测试命令、浏览器范围、通过/失败数量和证据位置，保留原始失败记录。若临时证据已丢失，应在隔离配置和假客户端下重新复现，不能推断问题已经解决。涉及真实 App、Windows 或公网的验证应单独记录。

## 工作区

- agentTools：`/Users/weihaiqiu/IdeaProjects/agenttools-user-input-20261021`，分支 `codex/shared-user-input-20261021`，基于 `28879abe`。仅增加协议回归与更新远程参考，未修改运行代码。
- AgentHarbor：`/Users/weihaiqiu/IdeaProjects/anywhere-user-input-20261021`，同名独立分支，基于 `3bbb39b`。网页、嵌入资源和回归都在这个 worktree。
- 实现工作树不包含其它会话之后新增的配对/设备切换修改。合并时保留原 checkout 的未提交工作；重叠文档合并两侧内容，嵌入资源由合并后的源码重新生成。

## 结果

旧网页仅从 `live.requests` 打开问答。当前安装版 Codex 还使用 `agentMessage.questions`，所以 App 可在继续工作的同时弹问题，网页却没有对应提示。

现在复用问答弹窗展示当前轮次异步问题，支持选项、自由文本、多题提交和关闭后恢复草稿。按官方问题身份和包装格式通过当前 owner 的 `/steer` 回传；携带 owner epoch 及 expected_turn_id。旧等待型提问仍走 `/answer`。App 已接受回答、网页刷新、完成或切换轮次都不会自动重发。回答以可读问答显示；不显示协议包装。

协议及版本证据见 [architecture.md](architecture.md#共享-app-的异步提问)。网页与 owner RPC 共用跨平台通道，没有新增 macOS 专属逻辑。Windows cwd 数据形状通过同一解析测试，不表示 Windows App 已实机验收。

## 已运行

- `npm run typecheck`、`npm run build`、`git diff --check` 通过。只有 `remote.js` 嵌入资源内容变化。
- 新解析/身份/无效输入 Node 回归 2 项通过。
- Chromium + WebKit 五语言异步问答共 10 项通过；覆盖 390px、选项/文字、多题、关闭恢复、owner epoch/轮次、可读回答、刷新不重发。
- 新 SSE 回归 2 项通过：执行中到达问题自动弹出、普通进度不抹草稿、App 已答即关闭、旧轮次不重新弹出。
- 聚焦问答、原等待型请求和队列草稿共 16 项通过。
- 旧版资源 `REMOTE_ASSET_DIR` 指向改动前网页时，新英文 Chromium 用例在等待 `#requestDialog[open]` 处实际失败，最终资源同用例通过。
- 网页全套（含新解析测试和五语言问答，SSE 两项随后单独增加并通过）共 290 项：274 通过、16 失败，不能称全绿。失败详情见下一节。
- agentTools 隔离 HOME、固定 Go 缓存：`go test -race ./internal/remoteclient/... -count=1` 全部通过；Windows、Linux `go vet ./internal/remoteclient/agents/codex/...` 通过；新增 Go 文件 gofmt 检查无输出。
- AgentHarbor 隔离 HOME、固定 Go 缓存：`go test -race ./...` 全部通过。
- Chromium/WebKit 390px 问答截图已人工查看，位于 `/tmp/agenttools-question-screenshots/`。关键日志位于 `/tmp/agenttools-question-{full-ui,before,baseline,focused,stream}.log`。

## 全套网页回归的开放问题

独立 `git archive 3bbb39b` 副本使用该提交自带旧资源与旧测试，以下四类各取一项代表用例均复现失败；没有通过放松断言隐藏问题，也没有把它们混入问答修改。基线记录 `/tmp/agenttools-question-baseline.log`。

| 问题 | 全套失败数 | 证据与原因 | 状态 |
| --- | ---: | --- | --- |
| 侧栏分组断言过时 | 4 | 页面多出 `Projects` 分组，旧测试只期待项目名 | 待独立修正测试契约 |
| 配对恢复 fixture 的标记要求不符 | 2 | `relay-ui.test.cjs:28` 期待 `X-Codex-Remote: 1`，某请求未带该头 | 待独立定位具体请求与契约 |
| 管理入口选择器过时 | 8 | `.settings-link[href="/admin"]` 已不存在，等待超时 | 待独立更新选择器并核实入口 |
| 在线轮询时钟回归超时 | 2 | 第二次推进虚拟时钟后未等到 `/api/device`；单独跑也复现 | 待独立检查异步轮询重新排程与测试时钟同步 |

上述开放问题不纳入本次问答修改。用户随后批准合并并要求不运行任何测试；这些历史结果不代表合并后重新验收。

## 未验证

未操作日常 Codex 会话、账户、凭据、网关或安装应用。没有真实模型问答、公网/手机实机、Windows App 实机验收，没有全仓库发布构建或安装包。App 私有协议未来版本可能变化；目前字段证据来自 macOS 安装版，不能将跨编译或 fixtures 视为 Windows 运行证明。
