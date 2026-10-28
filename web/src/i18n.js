window.REMOTE_I18N = {zh: {}};
Object.assign(window.REMOTE_I18N.zh, {
  'Remote control': '远程控制', 'Your computer, within reach.': '随时连接你的电脑。',
  'Open the pairing link from agentTools on your computer, or paste its pairing key below.': '打开电脑上 agentTools 生成的配对链接，或在下方输入配对密钥。',
  'Pairing key': '配对密钥', 'Pair browser': '配对此浏览器', 'Disconnect browser': '断开此浏览器', 'Pair this browser first': '请先配对此浏览器',
  'Pinned': '置顶', 'Recent': '最近', 'Projects': '项目',
  'Projects and sessions': '项目与会话', 'Choose a project': '选择项目', 'All projects': '全部项目', 'History': '历史会话', 'Refresh': '刷新', 'Load more': '加载更多', 'Choose a session': '选择一个会话',
  'New session': '新建会话', 'Untitled session': '未命名会话', 'No sessions yet.': '暂无历史会话。', 'Message Codex': '向 Codex 发送消息', 'Send': '发送', 'Stop turn': '停止任务', 'Latest output': '最新输出',
  'You': '你', 'Codex': 'Codex', 'Tool': '工具', 'Ready': '就绪', 'Running': '执行中', 'Failed': '执行失败', 'Interrupted': '已停止', 'Waiting for you': '等待你的回复',
  'Approval required': '需要你的确认', 'Approve once': '仅允许此次', 'Decline': '拒绝', 'Codex has a question': 'Codex 需要你回答', 'Your answer': '你的回答', 'Submit answer': '提交回答',
  'Some output is truncated. Full history stays on your computer.': '部分输出已截断，完整历史保留在电脑上。', 'Connection failed.': '连接失败，请检查电脑是否在线。',
  'Public HTTPS address': '公网 HTTPS 地址', 'Server SSH host or alias': '服务器 SSH 主机或别名', 'Server forwarding port': '服务器转发端口', 'Shared projects': '允许访问的项目',
  'Server certificate (optional, PEM)': '服务器证书（可选，PEM 格式）', 'For an IP test with a self-signed certificate. A public HTTPS certificate needs no extra configuration.': '仅用于 IP 地址和自签名证书测试。使用公网 HTTPS 证书时无需填写。',
  'Additional project folders, one full path per line': '其他项目目录，每行一个完整路径', 'Start remote control': '开启远程控制', 'Stop remote control': '关闭远程控制', 'Remote control is off': '远程控制已关闭', 'Connected': '已连通', 'Connecting…': '连接中…',
  'Choose the projects this browser can access. Codex runs on this computer and keeps its existing model configuration.': '选择网页可以访问的项目。Codex 在本机运行，使用已有的模型配置。',
  'Set up key-based SSH login and verify the server fingerprint on this computer before starting.': '开启前，请先在本机配置 SSH 密钥登录，并验证服务器指纹。',
  'Keep this computer awake. Stopping remote control ends its tasks and revokes every pairing link.': '请保持电脑唤醒。关闭远程控制会停止它发起的任务，并撤销所有配对链接。',
  'Pairing link': '配对链接', 'Copy pairing link': '复制配对链接', 'Anyone with this link can read and control the shared projects. Share it only with your own devices.': '持有链接即可查看并操作已共享的项目。请仅在自己的设备上使用。',
  'Server setup': '服务器配置', 'Point this dedicated domain to your server. Add this site to Caddy; keep the forwarded port bound to 127.0.0.1.': '将专用域名指向服务器，把以下站点加入 Caddy。转发端口仅绑定 127.0.0.1。',
  'This project is not shared.': '该项目尚未允许远程访问。', 'Stop or finish the current turn first.': '请先停止当前任务，或等待它执行完成。', 'This request has already ended.': '该确认请求已经结束。',
  'Install Codex CLI on this computer first.': '请先在本机安装 Codex CLI。', 'Answer every question.': '请回答每个问题。', 'Codex disconnected. Stop and restart remote control.': 'Codex 已断开，请关闭后重新开启远程控制。'
});


Object.assign(window.REMOTE_I18N.zh, {
  "Invalid pairing key": "配对密钥无效",
  "Enter an HTTPS address with no path, query or credentials.": "请输入不含路径、查询参数或登录信息的 HTTPS 地址。",
  "Enter an SSH host or an alias from your SSH config.": "请输入 SSH 主机或本机 SSH 配置中的别名。",
  "The forwarded port must be between 1024 and 65535.": "转发端口必须在 1024 到 65535 之间。",
  "Choose between 1 and 100 project folders.": "请选择 1 到 100 个项目目录。",
  "Use a project's full folder path.": "请填写项目目录的完整路径。",
  "A project folder is missing.": "项目目录不存在。",
  "Enter a valid PEM server certificate.": "请填写有效的 PEM 服务器证书。",
  "Stop remote control before changing its configuration.": "请先关闭远程控制，再修改配置。",
  "Install OpenSSH and configure key-based server access first.": "请先安装 OpenSSH，并配置服务器的 SSH 密钥登录。",
  "Session not found.": "未找到会话。",
  "Codex returned no session ID.": "Codex 未返回会话 ID。",
  "Restart remote control to load more sessions.": "请重新开启远程控制，以加载更多会话。",
  "Enter a message of at most 64000 bytes.": "请输入消息，最多 64000 字节。",
  "This remote session has no running turn.": "该远程会话没有正在执行的任务。",
  "This decision is not available for this request.": "此请求不支持该确认选项。",
  "Invalid permission request.": "权限请求无效。",
  "Invalid question.": "问题格式无效。",
  "Unsupported request.": "暂不支持此类请求。",
  "The public address has not reached this computer. Check DNS, HTTPS and the server's reverse proxy.": "公网地址尚未连接到本机，请检查 DNS、HTTPS 和服务器反向代理。",
  "SSH connection ended. Check key-based login, known_hosts and the server's forwarding port. Retrying…": "SSH 连接已结束，正在重试。请检查密钥登录、服务器指纹和转发端口。"
});
if (typeof I18N !== 'undefined') Object.assign(I18N.zh, window.REMOTE_I18N.zh);

// The remote workspace shares these strings with the desktop setup page.
const remoteWorkspaceTranslations = [
  ["Creating switches this folder's branch. Other conversations using this folder are affected.", "创建时会切换此目录的分支，使用同一目录的其他对话也会受影响。", "建立時會切換此目錄的分支，使用同一目錄的其他對話也會受影響。", "作成時にこのフォルダーのブランチを切り替えます。同じフォルダーを使う他の会話にも影響します。", "Beim Erstellen wird der Branch dieses Ordners gewechselt. Andere Unterhaltungen mit diesem Ordner sind ebenfalls betroffen."],
  ["Choose an existing local branch.", "请选择现有本地分支。", "請選擇現有本機分支。", "既存のローカルブランチを選択してください。", "Wähle einen vorhandenen lokalen Branch."],
  ["Branch selection requires an updated agentTools client.", "选择分支需要更新电脑端 agentTools。", "選擇分支需要更新電腦端 agentTools。", "ブランチの選択には agentTools の更新が必要です。", "Die Branch-Auswahl erfordert einen aktuellen agentTools-Client."],
  ["Unable to switch branches. Check for conflicting changes or a branch in use elsewhere.", "无法切换分支，请检查未提交的冲突更改或分支是否已在其他目录使用。", "無法切換分支，請檢查未提交的衝突變更或分支是否已在其他目錄使用。", "ブランチを切り替えられません。競合する変更や別の場所で使用中のブランチを確認してください。", "Der Branch konnte nicht gewechselt werden. Prüfe auf kollidierende Änderungen oder einen andernorts verwendeten Branch."],
  ["The selected branch could not be confirmed. Check the project before retrying.", "无法确认所选分支，请检查项目后再重试。", "無法確認所選分支，請檢查專案後再重試。", "選択したブランチを確認できません。再試行する前にプロジェクトを確認してください。", "Der gewählte Branch konnte nicht bestätigt werden. Prüfe das Projekt vor einem erneuten Versuch."],
  ["The project has too many branches to display.", "项目分支过多，无法完整显示。", "專案分支過多，無法完整顯示。", "ブランチが多すぎて表示できません。", "Das Projekt hat zu viele Branches zur Anzeige."],
  ["Project folder", "项目目录", "專案目錄", "プロジェクトフォルダー", "Projektordner"],
  ["Branch", "分支", "分支", "ブランチ", "Branch"],
  ["New conversation branch", "新会话分支", "新對話分支", "新規会話のブランチ", "Branch für neue Unterhaltung"],
  ["Branch unknown", "分支未知", "分支未知", "ブランチ不明", "Branch unbekannt"],
  ["Detached HEAD", "游离 HEAD", "分離 HEAD", "Detached HEAD", "Detached HEAD"],
  ["No Git repository", "非 Git 项目", "非 Git 專案", "Git リポジトリなし", "Kein Git-Repository"],
  ["Unable to read the project's Git state.", "无法读取项目的 Git 状态。", "無法讀取專案的 Git 狀態。", "プロジェクトの Git 状態を読み取れません。", "Der Git-Status des Projekts konnte nicht gelesen werden."],
  ["Disconnected", "已断开", "已中斷", "切断済み", "Getrennt"],
  ["The selected Agent is not connected. Connect it in agentTools on your computer.", "所选智能体尚未连接，请在电脑端 agentTools 中连接。", "所選智慧代理尚未連線，請在電腦端 agentTools 中連線。", "選択したエージェントは未接続です。コンピューターの agentTools で接続してください。", "Der ausgewählte Agent ist nicht verbunden. Verbinde ihn in agentTools auf deinem Computer."],
  ["Accept edits", "允许编辑", "允許編輯", "編集を許可", "Änderungen erlauben"],
  ["Automatic approval review", "Auto 自动审批", "Auto 自動審批", "Auto 自動承認", "Auto-Genehmigungsprüfung"],
  ["This mode is unavailable when creating a conversation. Change it after connecting. Your draft is preserved.", "新建会话暂不支持此模式，请连接后再更改。草稿已保留。", "建立對話暫不支援此模式，請連線後再變更。草稿已保留。", "新規会話ではこのモードを使用できません。接続後に変更してください。下書きは保持されています。", "Dieser Modus ist beim Erstellen nicht verfügbar. Ändere ihn nach dem Verbinden. Dein Entwurf bleibt erhalten."],
  ["Agent", "智能体", "智慧代理", "エージェント", "Agent"],
  ["Agents", "智能体", "智慧代理", "エージェント", "Agenten"],
  ["Back to agents", "返回智能体列表", "返回智慧代理清單", "エージェント一覧に戻る", "Zurück zu den Agenten"],
  ["Loading agents…", "正在加载智能体…", "正在載入智慧代理…", "エージェントを読み込み中…", "Agenten werden geladen…"],
  ["Loading conversation…", "正在加载对话…", "正在載入對話…", "会話を読み込み中…", "Unterhaltung wird geladen…"],
  ["No agents in this conversation.", "此对话暂无智能体。", "此對話尚無智慧代理。", "この会話にはエージェントがありません。", "Keine Agenten in dieser Unterhaltung."],
  ["Unable to load agents.", "无法加载智能体。", "無法載入智慧代理。", "エージェントを読み込めません。", "Agenten konnten nicht geladen werden."],
  ["Unable to load this agent conversation.", "无法加载该智能体的对话。", "無法載入此智慧代理的對話。", "このエージェントの会話を読み込めません。", "Die Unterhaltung dieses Agenten konnte nicht geladen werden."],
  ["Stopped", "已停止", "已停止", "停止済み", "Gestoppt"],
  ["Unavailable", "不可用", "無法使用", "利用不可", "Nicht verfügbar"],
  ["Computer", "电脑", "電腦", "コンピューター", "Computer"],
  ["Switch computer", "切换电脑", "切換電腦", "コンピューターを切り替える", "Computer wechseln"],
  ["Choose a computer", "选择电脑", "選擇電腦", "コンピューターを選択", "Computer auswählen"],
  ["Pair another computer", "配对其他电脑", "配對其他電腦", "別のコンピューターをペアリング", "Weiteren Computer koppeln"],
  ["Pair this browser with this computer first.", "请先将此浏览器与该电脑配对。", "請先將此瀏覽器與該電腦配對。", "先にこのコンピューターとブラウザーをペアリングしてください。", "Kopple diesen Browser zuerst mit dem Computer."],
  ["This browser remembers 16 computers. Disconnect one before pairing another.", "此浏览器已记住 16 台电脑，请先断开其中一台再配对。", "此瀏覽器已記住 16 台電腦，請先中斷其中一台再配對。", "このブラウザーは16台のコンピューターを記憶しています。1台の接続を解除してからペアリングしてください。", "Dieser Browser kennt 16 Computer. Trenne einen, bevor du einen weiteren koppelst."],
  ["My account and devices", "我的账户与设备", "我的帳戶與裝置", "アカウントとデバイス", "Mein Konto und Geräte"],
  ["Close navigation", "关闭导航", "關閉導覽", "ナビゲーションを閉じる", "Navigation schließen"],
  ["Open navigation", "打开导航", "開啟導覽", "ナビゲーションを開く", "Navigation öffnen"],
  ["Search conversations", "搜索会话", "搜尋對話", "チャットを検索", "Unterhaltungen suchen"],
  ["Workspace", "工作区", "工作區", "ワークスペース", "Arbeitsbereich"],
  ["Sessions", "会话", "對話", "チャット", "Unterhaltungen"],
  ["Connected to your computer", "已连接你的电脑", "已連接你的電腦", "このコンピューターに接続中", "Mit deinem Computer verbunden"],
  ["Changes", "更改", "變更", "Änderungen", "Änderungen"],
  ["Conversation", "对话内容", "對話內容", "会話", "Unterhaltung"],
  ["YOUR LOCAL AGENT, ANYWHERE", "本机智能体，随时连接", "本機智慧代理，隨時連接", "いつでも、どこでもローカルエージェント", "DEIN LOKALER AGENT, ÜBERALL"],
  ["What can we build?", "想一起做点什么？", "想一起做點什麼？", "何を作りましょうか？", "Was entwickeln wir?"],
  ["Choose a project to start, or pick up a conversation from your history.", "选择项目开始，或从历史会话继续工作。", "選擇專案開始，或從歷史對話繼續工作。", "プロジェクトを選んで開始するか、履歴から会話を再開してください。", "Wähle ein Projekt oder setze eine frühere Unterhaltung fort."],
  ["Codex is thinking…", "Codex 正在思考…", "Codex 正在思考…", "Codex が考えています…", "Codex denkt nach…"],
  ["Ask Codex to do anything. @ for files, / for tools.", "告诉 Codex 你想做什么，@ 引用文件，/ 调用工具。", "告訴 Codex 你想做什麼，@ 引用檔案，/ 呼叫工具。", "Codex に依頼する。@ でファイル、/ でツールを選択。", "Stelle Codex eine Aufgabe. @ für Dateien, / für Tools."],
  ["Add attachments", "添加附件", "新增附件", "添付ファイルを追加", "Anhänge hinzufügen"],
  ["Configured model", "本机配置的模型", "本機設定的模型", "設定済みモデル", "Konfiguriertes Modell"],
  ["Default effort", "默认思考强度", "預設思考強度", "既定の推論強度", "Standard-Denkaufwand"],
  ["Default mode", "执行模式", "執行模式", "実行モード", "Ausführungsmodus"],
  ["Plan mode", "计划模式", "計畫模式", "プランモード", "Planungsmodus"],
  ["Workspace access", "工作区权限", "工作區權限", "ワークスペース権限", "Arbeitsbereichszugriff"],
  ["Close changes", "关闭更改面板", "關閉變更面板", "変更パネルを閉じる", "Änderungen schließen"],
  ["Close dialog", "关闭弹窗", "關閉對話框", "ダイアログを閉じる", "Dialog schließen"],
  ["Codex is waiting for you", "Codex 正在等待你的回复", "Codex 正在等待你的回覆", "Codex が回答を待っています", "Codex wartet auf deine Antwort"],
  ["Allow full access?", "允许完全访问权限？", "允許完整存取權限？", "フルアクセスを許可しますか？", "Vollzugriff erlauben?"],
  ["Codex can modify files anywhere on this computer and use the network. Only enable this for tasks you trust.", "Codex 将可以修改这台电脑上的任何文件并访问网络。仅在信任当前任务时开启。", "Codex 將可以修改這台電腦上的任何檔案並存取網路。僅在信任目前任務時開啟。", "Codex はこのコンピューター上の任意のファイルを変更し、ネットワークを利用できます。信頼できるタスクでのみ有効にしてください。", "Codex kann beliebige Dateien auf diesem Computer ändern und das Netzwerk nutzen. Nur für vertrauenswürdige Aufgaben aktivieren."],
  ["Allow full access", "允许完全访问权限", "允許完整存取權限", "フルアクセスを許可", "Vollzugriff erlauben"],
  ["Cancel", "取消", "取消", "キャンセル", "Abbrechen"],
  ["Codex runs on your computer. Review its changes.", "Codex 在你的电脑上执行任务，请检查它的更改。", "Codex 在你的電腦上執行任務，請檢查它的變更。", "Codex はこのコンピューターで動作します。変更を確認してください。", "Codex arbeitet auf deinem Computer. Prüfe seine Änderungen."],
  ["Enter to send · Shift + Enter for a new line", "Enter 发送 · Shift + Enter 换行", "Enter 傳送 · Shift + Enter 換行", "Enter で送信 · Shift + Enter で改行", "Enter zum Senden · Shift + Enter für Zeilenumbruch"],
  ["Connection timed out. Try again.", "连接超时，请重试。", "連接逾時，請重試。", "接続がタイムアウトしました。再試行してください。", "Zeitüberschreitung. Bitte erneut versuchen."],
  ["No matching conversations.", "没有匹配的会话。", "沒有符合的對話。", "一致するチャットはありません。", "Keine passenden Unterhaltungen."],
  ["None", "无", "無", "なし", "Keiner"],
  ["Minimal", "最低", "最低", "最小", "Minimal"],
  ["Low", "低", "低", "低", "Niedrig"],
  ["Medium", "中", "中", "中", "Mittel"],
  ["High", "高", "高", "高", "Hoch"],
  ["Extra high", "极高", "極高", "非常に高い", "Sehr hoch"],
  ["Maximum", "最高", "最高", "最大", "Maximum"],
  ["Ultra", "超高", "超高", "超高", "Ultra"],
  ["Read only", "只读权限", "唯讀權限", "読み取り専用", "Nur lesen"],
  ["Full access", "完全访问权限", "完整存取權限", "フルアクセス", "Vollzugriff"],
  ["Send follow-up", "发送追加指令", "傳送追加指令", "追加指示を送信", "Folgeanweisung senden"],
  ["Uploading attachments…", "正在上传附件…", "正在上傳附件…", "添付ファイルをアップロード中…", "Anhänge werden hochgeladen…"],
  ["You can send a follow-up while Codex works.", "Codex 正在执行，你可以发送追加指令。", "Codex 正在執行，你可以傳送追加指令。", "Codex の実行中も追加指示を送信できます。", "Du kannst während der Ausführung weitere Anweisungen senden."],
  ["Copy", "复制", "複製", "コピー", "Kopieren"],
  ["Copied", "已复制", "已複製", "コピーしました", "Kopiert"],
  ["Code", "代码", "程式碼", "コード", "Code"],
  ["Attachment", "附件", "附件", "添付ファイル", "Anhang"],
  ["Thinking", "思考过程", "思考過程", "思考", "Denkt nach"],
  ["Reasoning details are not exposed by this model.", "此模型未提供详细思考过程。", "此模型未提供詳細思考過程。", "このモデルは推論の詳細を公開していません。", "Dieses Modell stellt keine Denkdetails bereit."],
  ["Command", "运行命令", "執行命令", "コマンド実行", "Befehl"],
  ["Waiting for output…", "等待输出…", "等待輸出…", "出力を待っています…", "Warten auf Ausgabe…"],
  ["Exit code", "退出码", "結束碼", "終了コード", "Exit-Code"],
  ["File changes", "文件更改", "檔案變更", "ファイル変更", "Dateiänderungen"],
  ["files", "个文件", "個檔案", "ファイル", "Dateien"],
  ["Plan", "计划", "計畫", "プラン", "Plan"],
  ["Web search", "搜索网页", "搜尋網頁", "ウェブ検索", "Websuche"],
  ["Tool call", "调用工具", "呼叫工具", "ツール呼び出し", "Tool-Aufruf"],
  ["Tool calls", "工具调用", "工具呼叫", "ツール呼び出し", "Tool-Aufrufe"],
  ["Arguments", "调用参数", "呼叫參數", "引数", "Argumente"],
  ["Result", "执行结果", "執行結果", "結果", "Ergebnis"],
  ["Agent", "智能体", "智慧代理", "エージェント", "Agent"],
  ["Context compacted", "上下文已压缩", "上下文已壓縮", "コンテキストを圧縮しました", "Kontext komprimiert"],
  ["Review started", "开始检查", "開始檢查", "レビュー開始", "Überprüfung gestartet"],
  ["Review completed", "检查完成", "檢查完成", "レビュー完了", "Überprüfung abgeschlossen"],
  ["Completed", "已完成", "已完成", "完了", "Abgeschlossen"],
  ["Declined", "已拒绝", "已拒絕", "拒否", "Abgelehnt"],
  ["Pending", "待处理", "待處理", "保留中", "Ausstehend"],
  ["No file changes yet.", "暂无文件更改。", "尚無檔案變更。", "ファイル変更はまだありません。", "Noch keine Dateiänderungen."],
  ["Files changed by Codex will appear here.", "Codex 修改的文件会显示在这里。", "Codex 修改的檔案會顯示在這裡。", "Codex が変更したファイルがここに表示されます。", "Von Codex geänderte Dateien erscheinen hier."],
  ["No textual diff is available.", "该文件没有可显示的文本差异。", "此檔案沒有可顯示的文字差異。", "テキスト差分はありません。", "Kein Textvergleich verfügbar."],
  ["Current plan", "当前计划", "目前計畫", "現在のプラン", "Aktueller Plan"],
  ["Model", "模型", "模型", "モデル", "Modell"],
  ["Use the model configured on your computer.", "使用这台电脑已配置的模型。", "使用這台電腦已設定的模型。", "このコンピューターに設定されたモデルを使用します。", "Das auf deinem Computer konfigurierte Modell verwenden."],
  ["No models were returned by Codex.", "Codex 没有返回可选模型。", "Codex 沒有傳回可選模型。", "Codex からモデルが返されませんでした。", "Codex hat keine Modelle zurückgegeben."],
  ["Reasoning effort", "思考强度", "思考強度", "推論強度", "Denkaufwand"],
  ["Select a model to see its reasoning levels.", "选择模型后可查看对应的思考强度。", "選擇模型後可查看對應的思考強度。", "モデルを選択すると推論強度が表示されます。", "Wähle ein Modell, um seine Denkstufen zu sehen."],
  ["Collaboration mode", "协作模式", "協作模式", "協調モード", "Zusammenarbeitsmodus"],
  ["Discuss a plan before changing files.", "修改文件前先讨论并制定计划。", "修改檔案前先討論並擬定計畫。", "ファイルを変更する前にプランを相談します。", "Vor Dateiänderungen einen Plan besprechen."],
  ["Codex can implement the task.", "允许 Codex 执行任务并修改文件。", "允許 Codex 執行任務並修改檔案。", "Codex がタスクを実行してファイルを変更します。", "Codex kann die Aufgabe umsetzen."],
  ["Computer permissions", "电脑访问权限", "電腦存取權限", "コンピューターの権限", "Computerberechtigungen"],
  ["Read project files; changes require approval.", "读取项目文件，修改操作需要确认。", "讀取專案檔案，修改操作需要確認。", "プロジェクトを読み取ります。変更には承認が必要です。", "Projektdateien lesen; Änderungen erfordern eine Freigabe."],
  ["Edit files in the shared project; ask before broader access.", "可编辑共享项目内的文件，更广泛的访问需要确认。", "可編輯共用專案內的檔案，更廣泛的存取需要確認。", "共有プロジェクト内を編集できます。追加のアクセスは確認します。", "Dateien im freigegebenen Projekt bearbeiten; weitergehenden Zugriff bestätigen."],
  ["Edit any file and access the network on this computer.", "可编辑这台电脑上的任何文件并访问网络。", "可編輯這台電腦上的任何檔案並存取網路。", "任意のファイルを編集し、ネットワークを利用できます。", "Beliebige Dateien bearbeiten und das Netzwerk nutzen."],
  ["Choose a project first.", "请先选择项目。", "請先選擇專案。", "先にプロジェクトを選択してください。", "Bitte zuerst ein Projekt wählen."],
  ["Attachments must be 20 MB or smaller.", "单个附件不能超过 20 MB。", "單一附件不能超過 20 MB。", "添付ファイルは 20 MB 以下にしてください。", "Anhänge dürfen höchstens 20 MB groß sein."],
  ["Remove attachment", "移除附件", "移除附件", "添付ファイルを削除", "Anhang entfernen"],
  ["Choose a model and reasoning effort", "选择模型和思考强度", "選擇模型與思考強度", "モデルと推論強度を選択", "Modell und Denkaufwand wählen"],
  ["Change computer permissions", "更改电脑访问权限", "變更電腦存取權限", "コンピューターの権限を変更", "Computerberechtigungen ändern"],
  ["Directory", "目录", "目錄", "ディレクトリ", "Verzeichnis"],
  ["No matching files or tools.", "没有匹配的文件或工具。", "沒有符合的檔案或工具。", "一致するファイルやツールはありません。", "Keine passenden Dateien oder Tools."],
  ["A tool needs your input", "工具需要你提供信息", "工具需要你提供資訊", "ツールに入力が必要です", "Ein Tool benötigt deine Eingabe"],
  ["Open tool authorization", "打开工具授权页面", "開啟工具授權頁面", "ツールの認証ページを開く", "Tool-Autorisierung öffnen"],
  ["Approve for this session", "在此会话中允许", "在此對話中允許", "この会話で許可", "Für diese Unterhaltung erlauben"],
  ["Approve this command rule", "允许此命令规则", "允許此命令規則", "このコマンド規則を許可", "Diese Befehlsregel erlauben"],
  ["Approve network rule", "允许此网络规则", "允許此網路規則", "ネットワーク規則を許可", "Netzwerkregel erlauben"],
  ["Approve", "允许", "允許", "許可", "Erlauben"],
  ["Language", "语言", "語言", "言語", "Sprache"],
  ["Open in Codex app", "在 Codex App 中打开", "在 Codex App 中開啟", "Codex アプリで開く", "In der Codex-App öffnen"],
];
for (const [key, zh, tw, ja, de] of remoteWorkspaceTranslations) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) {
    window.REMOTE_I18N[code] ||= {};
    window.REMOTE_I18N[code][key] = value;
  }
}
for (const [key, tw, ja, de] of [
['Remote control','遠端控制','リモート操作','Fernsteuerung'],
['Your computer, within reach.','隨時連接你的電腦。','いつでも、あなたのコンピューターへ。','Dein Computer, immer erreichbar.'],
['Open the pairing link from agentTools on your computer, or paste its pairing key below.','開啟電腦上 agentTools 產生的配對連結，或在下方輸入配對金鑰。','コンピューター上の agentTools で発行したリンクを開くか、ペアリングキーを入力してください。','Öffne den Kopplungslink von agentTools oder füge den Kopplungsschlüssel unten ein.'],
['Pairing key','配對金鑰','ペアリングキー','Kopplungsschlüssel'],['Pair browser','配對此瀏覽器','ブラウザーをペアリング','Browser koppeln'],['Disconnect browser','中斷此瀏覽器','ブラウザーを切断','Browser trennen'],['Pair this browser first','請先配對此瀏覽器','先にブラウザーをペアリングしてください','Bitte zuerst diesen Browser koppeln'],
['Pinned','置頂','ピン留め','Angeheftet'],['Recent','最近','最近','Zuletzt'],['Projects','專案','プロジェクト','Projekte'],
['Projects and sessions','專案與對話','プロジェクトとチャット','Projekte und Unterhaltungen'],['Choose a project','選擇專案','プロジェクトを選択','Projekt wählen'],['All projects','全部專案','すべてのプロジェクト','Alle Projekte'],['History','歷史對話','履歴','Verlauf'],['Refresh','重新整理','更新','Aktualisieren'],['Load more','載入更多','さらに読み込む','Mehr laden'],['Choose a session','選擇一個對話','チャットを選択','Unterhaltung wählen'],['New session','新增對話','新しいチャット','Neue Unterhaltung'],['Untitled session','未命名對話','無題のチャット','Unbenannte Unterhaltung'],['No sessions yet.','尚無歷史對話。','チャットはまだありません。','Noch keine Unterhaltungen.'],
['Message Codex','向 Codex 傳送訊息','Codex にメッセージ','Nachricht an Codex'],['Send','傳送','送信','Senden'],['Stop turn','停止任務','タスクを停止','Aufgabe stoppen'],['Latest output','最新輸出','最新の出力','Neueste Ausgabe'],['You','你','あなた','Du'],['Codex','Codex','Codex','Codex'],['Tool','工具','ツール','Tool'],['Ready','就緒','準備完了','Bereit'],['Running','執行中','実行中','Wird ausgeführt'],['Failed','執行失敗','失敗','Fehlgeschlagen'],['Interrupted','已停止','停止済み','Unterbrochen'],['Waiting for you','等待你的回覆','回答を待っています','Wartet auf dich'],
['Approval required','需要你的確認','承認が必要です','Freigabe erforderlich'],['Approve once','僅允許此次','今回のみ許可','Einmal erlauben'],['Decline','拒絕','拒否','Ablehnen'],['Codex has a question','Codex 需要你回答','Codex からの質問','Codex hat eine Frage'],['Your answer','你的回答','回答','Deine Antwort'],['Submit answer','提交回答','回答を送信','Antwort senden'],['Some output is truncated. Full history stays on your computer.','部分輸出已截斷，完整歷史保留在電腦上。','一部の出力は省略されています。完全な履歴はコンピューターに保存されています。','Ein Teil der Ausgabe ist gekürzt. Der vollständige Verlauf bleibt auf deinem Computer.'],['Connection failed.','連接失敗，請檢查電腦是否在線。','接続に失敗しました。コンピューターの接続を確認してください。','Verbindung fehlgeschlagen. Prüfe, ob dein Computer online ist.'],
['Public HTTPS address','公網 HTTPS 位址','公開 HTTPS アドレス','Öffentliche HTTPS-Adresse'],['Server SSH host or alias','伺服器 SSH 主機或別名','サーバーの SSH ホストまたは別名','SSH-Host oder Alias des Servers'],['Server forwarding port','伺服器轉發連接埠','サーバー転送ポート','Weiterleitungsport des Servers'],['Shared projects','允許存取的專案','共有プロジェクト','Freigegebene Projekte'],['Server certificate (optional, PEM)','伺服器憑證（選填，PEM 格式）','サーバー証明書（任意、PEM）','Serverzertifikat (optional, PEM)'],['For an IP test with a self-signed certificate. A public HTTPS certificate needs no extra configuration.','僅用於 IP 位址與自簽憑證測試。使用公網 HTTPS 憑證時不需填寫。','自己署名証明書による IP テスト用です。公開 HTTPS 証明書では設定不要です。','Für einen IP-Test mit selbstsigniertem Zertifikat. Ein öffentliches HTTPS-Zertifikat benötigt keine Zusatzkonfiguration.'],['Additional project folders, one full path per line','其他專案目錄，每行一個完整路徑','追加のプロジェクトフォルダー（絶対パスを1行ずつ）','Weitere Projektordner, ein vollständiger Pfad pro Zeile'],
['Start remote control','開啟遠端控制','リモート操作を開始','Fernsteuerung starten'],['Stop remote control','關閉遠端控制','リモート操作を停止','Fernsteuerung stoppen'],['Remote control is off','遠端控制已關閉','リモート操作はオフです','Fernsteuerung ist aus'],['Connected','已連通','接続済み','Verbunden'],['Connecting…','連接中…','接続中…','Verbindung wird hergestellt…'],
['Choose the projects this browser can access. Codex runs on this computer and keeps its existing model configuration.','選擇網頁可以存取的專案。Codex 在本機執行，使用既有的模型設定。','ブラウザーからアクセスできるプロジェクトを選択します。Codex は既存のモデル設定でこのコンピューター上で動作します。','Wähle die zugänglichen Projekte. Codex läuft mit seiner bestehenden Modellkonfiguration auf diesem Computer.'],['Set up key-based SSH login and verify the server fingerprint on this computer before starting.','開啟前，請先在本機設定 SSH 金鑰登入，並驗證伺服器指紋。','開始前に SSH キー認証を設定し、このコンピューターでサーバーのフィンガープリントを確認してください。','Richte vor dem Start SSH-Schlüsselanmeldung ein und prüfe den Serverfingerabdruck auf diesem Computer.'],['Keep this computer awake. Stopping remote control ends its tasks and revokes every pairing link.','請保持電腦喚醒。關閉遠端控制會停止它發起的任務，並撤銷所有配對連結。','コンピューターを起動したままにしてください。リモート操作を停止するとタスクが終了し、ペアリングリンクが失効します。','Halte diesen Computer wach. Beim Stoppen enden seine Aufgaben und alle Kopplungslinks werden ungültig.'],
['Pairing link','配對連結','ペアリングリンク','Kopplungslink'],['Copy pairing link','複製配對連結','ペアリングリンクをコピー','Kopplungslink kopieren'],['Anyone with this link can read and control the shared projects. Share it only with your own devices.','持有連結即可查看並操作已共用的專案。請僅在自己的裝置上使用。','このリンクを持つ人は共有プロジェクトを閲覧・操作できます。自分のデバイスでのみ使用してください。','Mit diesem Link können freigegebene Projekte gelesen und gesteuert werden. Nur auf eigenen Geräten verwenden.'],['Server setup','伺服器設定','サーバー設定','Servereinrichtung'],['Point this dedicated domain to your server. Add this site to Caddy; keep the forwarded port bound to 127.0.0.1.','將專用網域指向伺服器，把以下站台加入 Caddy。轉發連接埠僅綁定 127.0.0.1。','専用ドメインをサーバーに向け、Caddy にサイトを追加します。転送ポートは 127.0.0.1 にバインドしてください。','Richte die eigene Domain auf den Server und füge diese Site zu Caddy hinzu. Den Weiterleitungsport nur an 127.0.0.1 binden.'],
['This project is not shared.','此專案尚未允許遠端存取。','このプロジェクトは共有されていません。','Dieses Projekt ist nicht freigegeben.'],['Stop or finish the current turn first.','請先停止目前任務，或等待它執行完成。','先に現在のタスクを停止または完了してください。','Bitte die aktuelle Aufgabe zuerst stoppen oder abschließen.'],['This request has already ended.','此確認請求已經結束。','このリクエストはすでに終了しています。','Diese Anfrage ist bereits beendet.'],['Install Codex CLI on this computer first.','請先在本機安裝 Codex CLI。','先にこのコンピューターに Codex CLI をインストールしてください。','Bitte zuerst Codex CLI auf diesem Computer installieren.'],['Answer every question.','請回答每個問題。','すべての質問に回答してください。','Bitte jede Frage beantworten.'],['Codex disconnected. Stop and restart remote control.','Codex 已中斷，請關閉後重新開啟遠端控制。','Codex が切断されました。リモート操作を再起動してください。','Codex wurde getrennt. Bitte die Fernsteuerung neu starten.'],
['Invalid pairing key','配對金鑰無效','ペアリングキーが無効です','Ungültiger Kopplungsschlüssel'],['Enter an HTTPS address with no path, query or credentials.','請輸入不含路徑、查詢參數或登入資訊的 HTTPS 位址。','パス、クエリ、認証情報を含まない HTTPS アドレスを入力してください。','Eine HTTPS-Adresse ohne Pfad, Abfrage oder Zugangsdaten eingeben.'],['Enter an SSH host or an alias from your SSH config.','請輸入 SSH 主機或本機 SSH 設定中的別名。','SSH ホストまたは SSH 設定の別名を入力してください。','Einen SSH-Host oder Alias aus der SSH-Konfiguration eingeben.'],['The forwarded port must be between 1024 and 65535.','轉發連接埠必須在 1024 至 65535 之間。','転送ポートは 1024～65535 にしてください。','Der Weiterleitungsport muss zwischen 1024 und 65535 liegen.'],['Choose between 1 and 100 project folders.','請選擇 1 至 100 個專案目錄。','プロジェクトフォルダーを 1～100 個選択してください。','Zwischen 1 und 100 Projektordner wählen.'],['Use a project\'s full folder path.','請填寫專案目錄的完整路徑。','プロジェクトフォルダーの絶対パスを使用してください。','Den vollständigen Ordnerpfad des Projekts verwenden.'],['A project folder is missing.','專案目錄不存在。','プロジェクトフォルダーが見つかりません。','Ein Projektordner fehlt.'],['Enter a valid PEM server certificate.','請填寫有效的 PEM 伺服器憑證。','有効な PEM サーバー証明書を入力してください。','Ein gültiges PEM-Serverzertifikat eingeben.'],['Stop remote control before changing its configuration.','請先關閉遠端控制，再修改設定。','設定を変更する前にリモート操作を停止してください。','Vor Konfigurationsänderungen die Fernsteuerung stoppen.'],['Install OpenSSH and configure key-based server access first.','請先安裝 OpenSSH，並設定伺服器 SSH 金鑰登入。','先に OpenSSH をインストールしてサーバーの SSH キー認証を設定してください。','Zuerst OpenSSH installieren und den Serverzugriff per SSH-Schlüssel einrichten.'],['Session not found.','未找到對話。','チャットが見つかりません。','Unterhaltung nicht gefunden.'],['Codex returned no session ID.','Codex 未傳回對話 ID。','Codex からチャット ID が返されませんでした。','Codex hat keine Unterhaltungs-ID zurückgegeben.'],['Restart remote control to load more sessions.','請重新開啟遠端控制，以載入更多對話。','さらにチャットを読み込むにはリモート操作を再起動してください。','Fernsteuerung neu starten, um mehr Unterhaltungen zu laden.'],['Enter a message of at most 64000 bytes.','請輸入訊息，最多 64000 位元組。','64000 バイト以内のメッセージを入力してください。','Eine Nachricht mit höchstens 64000 Bytes eingeben.'],['This remote session has no running turn.','此遠端對話沒有正在執行的任務。','このリモートチャットには実行中のタスクがありません。','In dieser Unterhaltung wird keine Aufgabe ausgeführt.'],['This decision is not available for this request.','此請求不支援該確認選項。','このリクエストではその判断を選択できません。','Diese Entscheidung ist für diese Anfrage nicht verfügbar.'],['Invalid permission request.','權限請求無效。','権限リクエストが無効です。','Ungültige Berechtigungsanfrage.'],['Invalid question.','問題格式無效。','質問が無効です。','Ungültige Frage.'],['Unsupported request.','暫不支援此類請求。','未対応のリクエストです。','Nicht unterstützte Anfrage.'],['The public address has not reached this computer. Check DNS, HTTPS and the server\'s reverse proxy.','公網位址尚未連接本機，請檢查 DNS、HTTPS 與伺服器反向代理。','公開アドレスがこのコンピューターに届いていません。DNS、HTTPS、リバースプロキシを確認してください。','Die öffentliche Adresse erreicht diesen Computer nicht. DNS, HTTPS und den Reverse-Proxy prüfen.'],['SSH connection ended. Check key-based login, known_hosts and the server\'s forwarding port. Retrying…','SSH 連接已結束，正在重試。請檢查金鑰登入、伺服器指紋與轉發連接埠。','SSH 接続が終了しました。キー認証、known_hosts、転送ポートを確認してください。再試行中…','SSH-Verbindung beendet. Schlüsselanmeldung, known_hosts und Weiterleitungsport prüfen. Neuer Versuch…'],
['Load older conversation','載入較早對話','以前の会話を読み込む','Ältere Unterhaltung laden']
]) {
  for (const [code, value] of [['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
}
window.REMOTE_I18N.zh['Load older conversation'] = '加载更早的对话';
window.REMOTE_I18N.ja.Changes = '変更';
if (typeof I18N !== 'undefined') {
  for (const code of ['zh', 'zh-TW', 'ja', 'de']) {
    I18N[code] ||= {};
    Object.assign(I18N[code], window.REMOTE_I18N[code]);
  }
}
for (const [key, zh, tw, ja, de] of [
['Running a command…','正在运行命令…','正在執行命令…','コマンドを実行中…','Ein Befehl wird ausgeführt…'],
['Using a tool…','正在调用工具…','正在呼叫工具…','ツールを使用中…','Ein Tool wird verwendet…'],
['Updating files…','正在修改文件…','正在修改檔案…','ファイルを更新中…','Dateien werden aktualisiert…'],
['Searching the web…','正在搜索网页…','正在搜尋網頁…','ウェブを検索中…','Das Web wird durchsucht…'],
['Check the number of selected options.','请检查已选选项的数量。','請檢查已選選項的數量。','選択した項目数を確認してください。','Bitte die Anzahl der gewählten Optionen prüfen.']
]) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) {
    window.REMOTE_I18N[code][key] = value;
    if (typeof I18N !== 'undefined') I18N[code][key] = value;
  }
}

for (const [code, value] of [['zh','图片附件'],['zh-TW','圖片附件'],['ja','添付画像'],['de','Angehängtes Bild']]) window.REMOTE_I18N[code]['Attached image'] = value;

for (const [code, value] of [['zh','部分工具暂不可用'],['zh-TW','部分工具暫時無法使用'],['ja','一部の連携を利用できません'],['de','Einige Integrationen sind nicht verfügbar']]) window.REMOTE_I18N[code]['Some integrations are unavailable'] = value;
for (const [key, zh, tw, ja, de] of [
['Live updates','实时连接','即時連接','リアルタイム接続','Live-Verbindung'],
['Connecting live updates…','正在建立实时连接…','正在建立即時連接…','リアルタイム接続中…','Live-Verbindung wird hergestellt…'],
['Reconnecting live updates…','正在恢复实时连接…','正在恢復即時連接…','リアルタイム接続を再試行中…','Live-Verbindung wird wiederhergestellt…'],
['Live stream unavailable; refreshing periodically.','实时连接暂不可用，正在定时刷新。','即時連接暫時無法使用，正在定時重新整理。','リアルタイム接続を利用できないため、定期的に更新しています。','Live-Verbindung nicht verfügbar; regelmäßige Aktualisierung.']
]) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
}

for (const [code, value] of [['zh','正在生成回答…'],['zh-TW','正在產生回答…'],['ja','回答を作成中…'],['de','Antwort wird geschrieben…']]) window.REMOTE_I18N[code]['Writing a response…'] = value;

for (const [key, zh, tw, ja, de] of [
  ["Open your service's pairing link, or paste its pairing key below.", '打开服务生成的配对链接，或在下方输入配对密钥。', '開啟服務產生的配對連結，或在下方輸入配對金鑰。', 'サービスのペアリングリンクを開くか、下にペアリングキーを入力してください。', 'Öffne den Kopplungslink deines Dienstes oder füge unten den Schlüssel ein.'],
  ['Settings', '设置', '設定', '設定', 'Einstellungen'],
  ['Project files', '项目文件', '專案檔案', 'プロジェクトファイル', 'Projektdateien'],
  ['Files', '文件', '檔案', 'ファイル', 'Dateien'],
  ['Find a file', '搜索文件', '搜尋檔案', 'ファイルを検索', 'Datei suchen'],
  ['Back to files', '返回文件列表', '返回檔案清單', 'ファイル一覧に戻る', 'Zurück zu den Dateien'],
  ['Download file', '下载文件', '下載檔案', 'ファイルをダウンロード', 'Datei herunterladen'],
  ['Open file', '打开文件', '開啟檔案', 'ファイルを開く', 'Datei öffnen'],
  ['Loading file…', '正在读取文件…', '正在讀取檔案…', 'ファイルを読み込み中…', 'Datei wird geladen…'],
  ['Loading conversation settings…', '正在加载会话设置…', '正在載入對話設定…', '会話設定を読み込み中…', 'Unterhaltungseinstellungen werden geladen…'],
  ['Confirming conversation connection…', '正在确认会话连接…', '正在確認對話連線…', '会話接続を確認中…', 'Unterhaltungsverbindung wird bestätigt…'],
  ['Loading skills and tools…', '正在加载技能和工具…', '正在載入技能與工具…', 'スキルとツールを読み込み中…', 'Skills und Tools werden geladen…'],
  ['Binary file. Download to view it.', '此文件无法以文本预览，请下载查看。', '此檔案無法以文字預覽，請下載查看。', 'このファイルはダウンロードして確認してください。', 'Binärdatei. Zum Ansehen herunterladen.'],
  ['Preview truncated. Download the complete file.', '预览已截断，可下载完整文件。', '預覽已截斷，可下載完整檔案。', 'プレビューは省略されています。完全なファイルをダウンロードしてください。', 'Vorschau gekürzt. Vollständige Datei herunterladen.'],
  ['Search to find more files.', '输入文件名查找更多文件。', '輸入檔案名稱尋找更多檔案。', '検索して他のファイルを探してください。', 'Suchen, um weitere Dateien zu finden.'],
  ['Execute this plan?', '执行此计划？', '執行此計畫？', 'この計画を実行しますか？', 'Diesen Plan ausführen?'],
  ["The plan is ready. Start implementation when you're ready.", '计划已就绪，确认后开始执行。', '計畫已就緒，確認後開始執行。', '計画の準備ができました。確認すると実装を開始します。', 'Der Plan ist bereit. Nach Bestätigung beginnt die Umsetzung.'],
  ['Execute plan', '执行计划', '執行計畫', '計画を実行', 'Plan ausführen'],
  ['Continue planning', '继续修改计划', '繼續修改計畫', '計画を修正', 'Plan weiter bearbeiten'],
  ['Keep planning', '暂不执行', '暫不執行', 'まだ実行しない', 'Weiter planen'],
  ['Codex will switch to implementation mode and follow this plan with the selected permissions.', 'Codex 将切换到执行模式，按照此计划和当前所选权限执行。', 'Codex 將切換至執行模式，依照此計畫及目前選取的權限執行。', 'Codex は実装モードに切り替え、選択した権限でこの計画を実行します。', 'Codex wechselt in den Umsetzungsmodus und führt diesen Plan mit den gewählten Berechtigungen aus.'],
  ['Background activity', '后台活动', '背景活動', 'バックグラウンド処理', 'Hintergrundaktivität'],
  ['Unable to load changes.', '无法读取文件更改。', '無法讀取檔案變更。', '変更を読み込めませんでした。', 'Änderungen konnten nicht geladen werden.'],
  ['Unable to check the plan.', '无法读取待执行计划。', '無法讀取待執行計畫。', '計画を確認できませんでした。', 'Der Plan konnte nicht geprüft werden.']
]) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
}

for (const [key, zh, tw, ja, de] of [
  ['Choose a file inside this project.', '请选择项目内的文件。', '請選擇專案內的檔案。', 'プロジェクト内のファイルを選んでください。', 'Wähle eine Datei innerhalb dieses Projekts.'],
  ['File references must stay inside an allowed local directory.', '文件必须位于本机允许访问的目录内。', '檔案必須位於本機允許存取的目錄內。', 'ファイルは許可されたローカルディレクトリ内にある必要があります。', 'Dateiverweise müssen in einem erlaubten lokalen Verzeichnis liegen.'],
  ['This project file is unavailable or is not a regular file.', '此文件无法读取，可能已删除或不是普通文件。', '此檔案無法讀取，可能已刪除或不是一般檔案。', 'このファイルは利用できないか、通常のファイルではありません。', 'Diese Datei ist nicht verfügbar oder keine reguläre Datei.'],
  ['This project root is unavailable or is not shared.', '项目目录无法访问，或尚未共享。', '專案目錄無法存取，或尚未共用。', 'プロジェクトのルートを利用できないか、共有されていません。', 'Der Projektordner ist nicht verfügbar oder nicht freigegeben.'],
  ['The completed plan is empty or truncated. Ask Codex to produce a complete plan.', '计划为空或已截断，请让 Codex 重新生成完整计划。', '計畫為空或已截斷，請讓 Codex 重新產生完整計畫。', '計画が空または省略されています。完全な計画を作成するよう Codex に依頼してください。', 'Der Plan ist leer oder gekürzt. Bitte Codex um einen vollständigen Plan.'],
  ['Choose a completed plan to execute.', '请选择已完成的计划。', '請選擇已完成的計畫。', '実行する完成済みの計画を選んでください。', 'Wähle einen fertigen Plan zur Ausführung.'],
  ['This plan has already been submitted for execution.', '此计划已提交执行，请刷新会话。', '此計畫已提交執行，請重新整理會話。', 'この計画は既に実行依頼済みです。', 'Dieser Plan wurde bereits zur Ausführung eingereicht.'],
  ['This plan is no longer ready to execute. Refresh the conversation.', '此计划已失效或当前有任务正在执行，请刷新会话。', '此計畫已失效或目前有工作正在執行，請重新整理會話。', 'この計画は実行できない状態です。会話を更新してください。', 'Dieser Plan kann nicht mehr ausgeführt werden. Aktualisiere die Unterhaltung.'],
  ['The plan request was processed, but saving its result failed. Refresh before continuing.', '计划请求已处理，但结果保存失败。请先刷新，避免重复执行。', '計畫請求已處理，但結果儲存失敗。請先重新整理，避免重複執行。', '計画の依頼は処理されましたが結果を保存できませんでした。続行する前に更新してください。', 'Die Plananfrage wurde verarbeitet, aber das Ergebnis nicht gespeichert. Vor dem Fortfahren aktualisieren.']
]) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
}

for (const [key, zh, tw, ja, de] of [
 ['Scan the QR code on the remote connection page in agentTools, or enter its authorization code.', '扫描 agentTools「远程连接」页面的二维码，或输入客户端生成的授权码。', '掃描 agentTools「遠端連線」頁面的 QR 碼，或輸入客戶端產生的授權碼。', 'agentTools のリモート接続ページで QR コードをスキャンするか、認証コードを入力してください。', 'Scanne den QR-Code auf der Fernzugriffsseite in agentTools oder gib den Autorisierungscode ein.'],
 ['Authorization code', '授权码', '授權碼', '認証コード', 'Autorisierungscode'],
 ['Authorization code is invalid or expired.', '授权码无效或已过期，请在 agentTools 中重新生成。', '授權碼無效或已過期，請在 agentTools 中重新產生。', '認証コードが無効または期限切れです。agentTools で再生成してください。', 'Der Autorisierungscode ist ungültig oder abgelaufen. Erstelle ihn erneut in agentTools.'],
 ['This browser stays authorized for 30 days. You can revoke it at any time in agentTools.', '授权会在此浏览器保留 30 天，你可以随时在 agentTools 中撤销。', '此瀏覽器的授權保留 30 天，可隨時在 agentTools 中撤銷。', 'このブラウザーの認証は 30 日間保持され、agentTools でいつでも取り消せます。', 'Dieser Browser bleibt 30 Tage autorisiert. Du kannst ihn jederzeit in agentTools widerrufen.'],
 ['Relay administration', '中转服务管理', '中繼服務管理', '中継サービス管理', 'Relay-Verwaltung'],
 ['Online', '在线', '線上', 'オンライン', 'Online'],
 ['Offline', '离线', '離線', 'オフライン', 'Offline'],
 ['Checking…', '正在检查…', '正在檢查…', '確認中…', 'Wird geprüft…'],
 ['Your computer is offline', '电脑当前离线', '電腦目前離線', 'コンピューターはオフラインです', 'Dein Computer ist offline'],
 ['Keep agentTools open and remote connection enabled. This browser will reconnect automatically.', '请保持 agentTools 运行并开启远程连接，网页会自动重连。', '請保持 agentTools 執行並開啟遠端連線，網頁將自動重新連線。', 'agentTools を起動し、リモート接続を有効にしてください。自動的に再接続します。', 'Lass agentTools mit aktiviertem Fernzugriff geöffnet. Die Verbindung wird automatisch wiederhergestellt.'],
 ['Retry connection', '重新连接', '重新連線', '再接続', 'Erneut verbinden'],
 ['Connected computer', '已授权电脑', '已授權電腦', '認証済みコンピューター', 'Autorisierter Computer'],
 ['Manage shared projects and authorized browsers on the remote connection page in agentTools.', '在 agentTools 的「远程连接」页面管理共享项目和已授权浏览器。', '在 agentTools「遠端連線」頁面管理共用專案和已授權瀏覽器。', 'agentTools のリモート接続ページで共有プロジェクトと認証済みブラウザーを管理できます。', 'Verwalte freigegebene Projekte und autorisierte Browser auf der Fernzugriffsseite in agentTools.'],
 ['Relay administration is separate and does not grant access to this computer.', '中转服务管理使用独立凭证，不授予访问这台电脑的权限。', '中繼服務管理使用獨立憑證，不會授予存取此電腦的權限。', '中継サービスの管理には別の認証が必要で、このコンピューターへのアクセス権は付与されません。', 'Die Relay-Verwaltung verwendet eigene Zugangsdaten und gewährt keinen Zugriff auf diesen Computer.']
]) for (const [code,value] of [['zh',zh],['zh-TW',tw],['ja',ja],['de',de]]) window.REMOTE_I18N[code][key]=value;

for (const [key, zh, tw, ja, de] of [
 ['Execute the plan, or add feedback to refine it.', '可以执行此计划，或补充意见继续完善。', '可以執行此計畫，或補充意見繼續完善。', '計画を実行するか、意見を追加して修正できます。', 'Führe den Plan aus oder ergänze Änderungswünsche.'],
 ['What would you like to add or change?', '你想补充或修改什么？', '你想補充或修改什麼？', '何を追加・変更しますか？', 'Was möchtest du ergänzen oder ändern?'],
 ['Codex will refine the plan using your feedback. You can review it again before execution.', 'Codex 会根据你的意见继续完善计划。新计划完成后，仍由你确认是否执行。', 'Codex 會根據你的意見繼續完善計畫。新計畫完成後，仍由你確認是否執行。', 'Codex が意見に沿って計画を修正します。実行前にもう一度確認できます。', 'Codex überarbeitet den Plan anhand deiner Wünsche. Vor der Ausführung kannst du ihn erneut prüfen.'],
 ['Plan feedback', '计划修改意见', '計畫修改意見', '計画への意見', 'Änderungswünsche zum Plan'],
 ['Describe your additions, changes, or constraints.', '例如：补充验收标准、调整实现顺序，或说明需要遵守的限制。', '例如：補充驗收標準、調整實作順序，或說明需要遵守的限制。', '追加事項、変更点、守るべき制約を入力してください。', 'Beschreibe Ergänzungen, Änderungen oder Vorgaben.'],
 ['Update plan', '继续完善计划', '繼續完善計畫', '計画を修正', 'Plan überarbeiten'],
 ['The plan changed. Close this dialog and review the latest conversation.', '计划已更新或有任务正在执行，请关闭此窗口并查看最新会话。', '計畫已更新或有工作正在執行，請關閉此視窗並查看最新會話。', '計画が変更されたか、処理が進行中です。この画面を閉じて最新の会話を確認してください。', 'Der Plan wurde geändert oder ein Vorgang läuft. Schließe diesen Dialog und prüfe die aktuelle Unterhaltung.'],
 ['Revise the previous plan using the following feedback. Return the complete updated plan and wait for my confirmation before implementation:', '请根据以下补充意见修改上一份计划，输出完整的更新版计划，等待我确认后再执行：', '請根據以下補充意見修改上一份計畫，輸出完整的更新版計畫，等待我確認後再執行：', '次の意見に沿って前の計画を修正し、更新後の計画全体を提示してください。実装は私の確認を待ってください：', 'Überarbeite den vorherigen Plan anhand der folgenden Wünsche. Gib den vollständigen aktualisierten Plan aus und warte vor der Umsetzung auf meine Bestätigung:']
]) for (const [code,value] of [['zh',zh],['zh-TW',tw],['ja',ja],['de',de]]) window.REMOTE_I18N[code][key]=value;

for (const [key, zh, tw, ja, de] of [
  ['Queued messages', '待发送消息', '待傳送訊息', '待機中のメッセージ', 'Nachrichten in der Warteschlange'],
  ['Accepted', '已接受', '已接受', '受け付け済み', 'Angenommen'],
  ['Attached audio', '附加音频', '附加音訊', '添付音声', 'Angehängte Audiodatei'],
  ['Edit queued message', '编辑待发送消息', '編輯待傳送訊息', '待機中のメッセージを編集', 'Wartende Nachricht bearbeiten'],
  ['Save changes', '保存修改', '儲存變更', '変更を保存', 'Änderungen speichern'],
  ['This queued message is no longer editable.', '这条待发送消息已无法编辑。', '這則待傳送訊息已無法編輯。', 'この待機中のメッセージは編集できなくなりました。', 'Diese wartende Nachricht kann nicht mehr bearbeitet werden.'],
  ['Unable to confirm queued message update.', '无法确认待发送消息是否已更新。', '無法確認待傳送訊息是否已更新。', '待機中のメッセージの更新を確認できませんでした。', 'Die Aktualisierung der wartenden Nachricht konnte nicht bestätigt werden.'],
  ['Queue message', '加入队列', '加入佇列', 'キューに追加', 'Nachricht einreihen'],
  ['Resume queue', '继续队列', '繼續佇列', 'キューを再開', 'Warteschlange fortsetzen'],
  ['Steer', '引导', '引導', '今すぐ送信', 'Jetzt senden'],
  ['Send this message to the current turn now', '立即将此消息补充到当前任务', '立即將此訊息補充至目前工作', 'このメッセージを現在のターンに送信', 'Diese Nachricht jetzt an den aktuellen Auftrag senden'],
  ['Remove queued message', '删除待发送消息', '刪除待傳送訊息', '待機メッセージを削除', 'Wartende Nachricht entfernen'],
  ['Waiting', '等待中', '等待中', '待機中', 'Wartend'],
  ['Sending…', '正在发送…', '正在傳送…', '送信中…', 'Wird gesendet…'],
  ['Delivery uncertain', '发送状态待确认', '傳送狀態待確認', '送信状態を要確認', 'Zustellung unklar'],
  ['The queue is paused. Review the conversation, then resume when ready.', '队列已暂停。请查看当前会话，确认后继续。', '佇列已暫停。請查看目前會話，確認後繼續。', 'キューは一時停止中です。会話を確認してから再開してください。', 'Die Warteschlange ist pausiert. Prüfe die Unterhaltung vor dem Fortsetzen.'],
  ['A message may already have been sent. Review the conversation before removing it.', '有消息可能已经发送，请先查看会话，再删除对应消息。', '有訊息可能已經傳送，請先查看會話，再刪除對應訊息。', 'メッセージは送信済みの可能性があります。削除する前に会話を確認してください。', 'Eine Nachricht könnte bereits gesendet worden sein. Prüfe die Unterhaltung, bevor du sie entfernst.'],
  ['The current approval or question still needs your answer. Queued messages will wait.', '当前审批或问题仍需你回答，队列消息会继续等待。', '目前審批或問題仍需你回答，佇列訊息會繼續等待。', '現在の承認や質問には回答が必要です。キューのメッセージは待機します。', 'Die aktuelle Genehmigung oder Frage benötigt weiterhin deine Antwort. Eingereihte Nachrichten warten.'],
  ['Codex still needs your answer. New messages will be queued.', 'Codex 仍在等待你的回答，新消息将加入队列。', 'Codex 仍在等待你的回答，新訊息將加入佇列。', 'Codex は回答を待っています。新しいメッセージはキューに追加されます。', 'Codex wartet auf deine Antwort. Neue Nachrichten werden eingereiht.'],
  ['Messages wait until the current task finishes. Use Steer to send one now.', '消息将在当前任务结束后发送，点击“引导”可提前发送。', '訊息將在目前工作結束後傳送，點選「引導」可提前傳送。', 'メッセージは現在のタスク完了後に送信されます。今すぐ送信することもできます。', 'Nachrichten warten bis zum Ende des aktuellen Auftrags. Mit „Jetzt senden“ sendest du sie sofort.'],
  ['Update agentTools on your computer to queue messages.', '请更新电脑上的 agentTools，以使用消息队列。', '請更新電腦上的 agentTools，以使用訊息佇列。', 'キュー機能を使うには、パソコンの agentTools を更新してください。', 'Aktualisiere agentTools auf deinem Computer, um die Warteschlange zu verwenden.'],
  ['Unable to load queued messages.', '无法读取消息队列。', '無法讀取訊息佇列。', 'メッセージキューを読み込めませんでした。', 'Die Warteschlange konnte nicht geladen werden.'],
  ['Move queued message up', '上移待发送消息', '上移待傳送訊息', '待機メッセージを上へ移動', 'Wartende Nachricht nach oben verschieben'],
  ['Move queued message down', '下移待发送消息', '下移待傳送訊息', '待機メッセージを下へ移動', 'Wartende Nachricht nach unten verschieben'],
  ['Messages wait until the current task finishes.', '消息将在当前任务结束后发送。', '訊息將在目前工作結束後傳送。', 'メッセージは現在のタスク完了後に送信されます。', 'Nachrichten warten bis zum Ende des aktuellen Auftrags.'],
  ['Message', '消息', '訊息', 'メッセージ', 'Nachricht']
]) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
}

for (const [key, zh, tw, ja, de] of [
  ['Allow app access?', '允许访问此应用？', '允許存取此應用程式？', 'アプリへのアクセスを許可しますか？', 'App-Zugriff erlauben?'],
  ['Allow this conversation', '允许此会话', '允許此會話', 'この会話で許可', 'Für diese Unterhaltung erlauben'],
  ['Always allow this app', '始终允许此应用', '一律允許此應用程式', 'このアプリを常に許可', 'Diese App immer erlauben'],
  ['Full access controls files and commands. App authorization is managed separately.', '完全访问权限控制文件和命令，应用访问需要单独授权。', '完整存取權限控制檔案和命令，應用程式存取需要另外授權。', 'フルアクセスはファイルとコマンドの権限です。アプリへのアクセスには別の許可が必要です。', 'Vollzugriff betrifft Dateien und Befehle. Der App-Zugriff wird separat genehmigt.']
]) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
}

for (const [key, zh, tw, ja, de] of [
  ['Ask for approval', '请求批准', '請求核准', '承認を求める', 'Um Genehmigung bitten'],
  ['Approve for me', '帮我批准', '幫我核准', '代理で承認', 'Für mich genehmigen'],
  ['Always ask before editing external files or using the internet.', '编辑外部文件或使用互联网前，始终请求批准。', '編輯外部檔案或使用網際網路前，一律請求核准。', '外部ファイルの編集やインターネット利用の前に必ず承認を求めます。', 'Vor dem Bearbeiten externer Dateien oder der Internetnutzung immer fragen.'],
  ['Only ask for actions detected as potentially unsafe.', '仅对被检测为可能不安全的操作请求批准。', '僅對偵測為可能不安全的操作請求核准。', '安全でない可能性が検出された操作についてのみ承認を求めます。', 'Nur bei als möglicherweise unsicher erkannten Aktionen fragen.'],
  ['Unrestricted access to the internet and any file on this computer.', '不受限制地访问互联网和此电脑上的任何文件。', '不受限制地存取網際網路與此電腦上的任何檔案。', 'インターネットとこのコンピューター上のすべてのファイルに制限なくアクセスします。', 'Uneingeschränkter Zugriff auf das Internet und alle Dateien dieses Computers.'],
  ['This permission mode is unavailable on this computer.', '此电脑目前不支持该权限模式。', '此電腦目前不支援此權限模式。', 'このコンピューターではこの権限モードを利用できません。', 'Dieser Berechtigungsmodus ist auf diesem Computer nicht verfügbar.'],
  ['Command approvals are disabled. Apps and tools may still request authorization or information.', '命令不再请求批准。应用和工具仍可能要求授权或补充信息。', '命令不再請求核准。應用程式與工具仍可能要求授權或補充資訊。', 'コマンドの承認は求めません。アプリやツールからの認証や情報の入力は引き続き必要になる場合があります。', 'Befehle benötigen keine Genehmigung mehr. Apps und Tools können weiterhin eine Autorisierung oder Angaben verlangen.']
]) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
}

for (const [key, zh, tw, ja, de] of [
  ['Automatic approval review is unavailable because Codex requirements could not be read.', '无法读取 Codex 权限要求，暂不可使用“帮我批准”。', '無法讀取 Codex 權限要求，暫時無法使用「幫我核准」。', 'Codex の要件を読み取れないため、代理承認を利用できません。', 'Die automatische Genehmigungsprüfung ist nicht verfügbar, weil die Codex-Anforderungen nicht gelesen werden konnten.'],
  ['This permission mode is disabled by your Codex requirements.', '你的 Codex 权限要求已禁用此模式。', '你的 Codex 權限要求已停用此模式。', 'Codex の要件により、この権限モードは無効になっています。', 'Dieser Berechtigungsmodus ist durch deine Codex-Anforderungen deaktiviert.']
]) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
}

for (const [code, value] of [
  ['zh', '你的 Codex 权限要求使用命名权限配置，当前远程客户端仅支持内置批准模式。'],
  ['zh-TW', '你的 Codex 權限要求使用具名權限設定，目前遠端用戶端僅支援內建核准模式。'],
  ['ja', 'Codex の要件では名前付き権限プロファイルが使用されています。このリモートクライアントは組み込みの承認モードのみ対応しています。'],
  ['de', 'Deine Codex-Anforderungen verwenden benannte Berechtigungsprofile. Dieser Remote-Client unterstützt derzeit nur die integrierten Genehmigungsmodi.']
]) window.REMOTE_I18N[code]['Your Codex requirements use named permission profiles. This remote client currently supports only the built-in approval modes.'] = value;

for (const [key, zh, tw, ja, de] of [
  ['Remote', '远程', '遠端', 'リモート', 'Remote'],
  ['Unknown source', '来源未知', '來源未知', 'ソース不明', 'Unbekannte Quelle'],
  ['New conversation folder', '新会话目录', '新會話目錄', '新しい会話のフォルダー', 'Ordner für die neue Unterhaltung'],
  ['The original application is unavailable for this action. Your draft is preserved.', '原应用目前无法执行此操作，你的草稿已保留。', '原應用程式目前無法執行此操作，你的草稿已保留。', '元のアプリでは現在この操作を実行できません。下書きは保持されています。', 'Diese Aktion ist in der ursprünglichen App derzeit nicht verfügbar. Dein Entwurf bleibt erhalten.'],
  ['Connected to the original application.', '已连接原应用。', '已連接原應用程式。', '元のアプリに接続しています。', 'Mit der ursprünglichen App verbunden.'],
  ['Automatic naming could not be confirmed. You can rename this chat in Codex.', '未能确认自动命名，你可以在 Codex 中重命名此会话。', '未能確認自動命名，你可以在 Codex 中重新命名此對話。', '自動命名を確認できませんでした。Codex でこのチャットの名前を変更できます。', 'Die automatische Benennung konnte nicht bestätigt werden. Du kannst diesen Chat in Codex umbenennen.'],
  ['Viewing the original application. Your draft stays here until control reconnects.', '正在查看原应用，恢复控制连接后可发送保留的草稿。', '正在查看原應用程式，恢復控制連線後可傳送保留的草稿。', '元のアプリを表示中です。操作接続が復旧するまで下書きを保持します。', 'Die ursprüngliche App wird angezeigt. Dein Entwurf bleibt bis zur Wiederverbindung erhalten.'],
  ['Following the original application…', '正在跟随原应用输出…', '正在跟隨原應用程式輸出…', '元のアプリの出力を表示中…', 'Ausgabe der ursprünglichen App wird verfolgt…'],
  ['Context', '上下文', '上下文', 'コンテキスト', 'Kontext'],
  ['Unknown', '未知', '未知', '不明', 'Unbekannt'],
  ['Compacting context…', '正在压缩上下文…', '正在壓縮上下文…', 'コンテキストを圧縮中…', 'Kontext wird komprimiert…']
]) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
}

for (const [key, zh, tw, ja, de] of [
  ['The local Codex IPC permissions could not be verified. Run Codex App and agentTools as the same user with the same privilege level, then reconnect remote control.', '无法验证本机 Codex IPC 权限。请使用同一用户、相同权限级别运行 Codex App 和 agentTools，然后重新连接远程控制。', '無法驗證本機 Codex IPC 權限。請使用同一使用者、相同權限層級執行 Codex App 與 agentTools，然後重新連接遠端控制。', 'ローカルの Codex IPC 権限を確認できませんでした。Codex App と agentTools を同じユーザー、同じ権限レベルで実行してから、リモート操作に再接続してください。', 'Die lokalen Codex-IPC-Berechtigungen konnten nicht geprüft werden. Starte Codex App und agentTools als derselbe Benutzer mit derselben Berechtigungsstufe und verbinde die Fernsteuerung erneut.'],
  ['The local Codex conversation owner check timed out. Wait for Codex App to respond, then reconnect remote control.', '检查本机会话控制方超时。请等待 Codex App 响应，然后重新连接远程控制。', '檢查本機對話控制端逾時。請等待 Codex App 回應，然後重新連接遠端控制。', 'ローカルの Codex 会話の制御元確認がタイムアウトしました。Codex App の応答を待ってから、リモート操作に再接続してください。', 'Die Prüfung der lokalen Codex-Unterhaltungssteuerung hat zu lange gedauert. Warte auf eine Antwort von Codex App und verbinde die Fernsteuerung erneut.'],
  ['The local Codex IPC version is unsupported. Update Codex App and agentTools, then reconnect remote control.', '当前本机 Codex IPC 版本不受支持。请更新 Codex App 和 agentTools，然后重新连接远程控制。', '目前本機 Codex IPC 版本不受支援。請更新 Codex App 與 agentTools，然後重新連接遠端控制。', 'ローカルの Codex IPC バージョンは未対応です。Codex App と agentTools を更新してから、リモート操作に再接続してください。', 'Die lokale Codex-IPC-Version wird nicht unterstützt. Aktualisiere Codex App und agentTools und verbinde die Fernsteuerung erneut.'],
  ['Codex IPC security could not be verified. Run Codex App and agentTools as the same local user with the same privilege level.', '无法验证 Codex IPC 安全状态。请使用同一本机用户、相同权限级别运行 Codex App 和 agentTools。', '無法驗證 Codex IPC 安全狀態。請使用同一本機使用者、相同權限層級執行 Codex App 與 agentTools。', 'Codex IPC の安全性を確認できませんでした。Codex App と agentTools を同じローカルユーザー、同じ権限レベルで実行してください。', 'Die Sicherheit von Codex IPC konnte nicht geprüft werden. Starte Codex App und agentTools als derselbe lokale Benutzer mit derselben Berechtigungsstufe.'],
  ['The local Codex IPC security query failed. Update agentTools and reconnect remote control.', '本机 Codex IPC 安全查询失败。请更新 agentTools，然后重新连接远程控制。', '本機 Codex IPC 安全查詢失敗。請更新 agentTools，然後重新連接遠端控制。', 'ローカルの Codex IPC セキュリティ確認に失敗しました。agentTools を更新して、リモート操作に再接続してください。', 'Die Sicherheitsabfrage des lokalen Codex IPC ist fehlgeschlagen. Aktualisiere agentTools und verbinde die Fernsteuerung erneut.'],
  ['Codex IPC initialization failed. Update Codex App and reconnect agentTools remote control.', 'Codex IPC 初始化失败。请更新 Codex App，然后重新连接 agentTools 远程控制。', 'Codex IPC 初始化失敗。請更新 Codex App，然後重新連接 agentTools 遠端控制。', 'Codex IPC の初期化に失敗しました。Codex App を更新し、agentTools のリモート操作に再接続してください。', 'Codex IPC konnte nicht initialisiert werden. Aktualisiere Codex App und verbinde die agentTools-Fernsteuerung erneut.'],
  ['The Codex IPC endpoint does not meet local user security requirements.', 'Codex IPC 连接端点不符合本机用户安全要求。', 'Codex IPC 連線端點不符合本機使用者安全要求。', 'Codex IPC の接続先がローカルユーザーのセキュリティ要件を満たしていません。', 'Der Codex-IPC-Endpunkt erfüllt nicht die Sicherheitsanforderungen des lokalen Benutzers.'],
  ['The local conversation owner could not be verified. Reconnect agentTools remote control before continuing.', '无法验证本机会话控制方。请重新连接 agentTools 远程控制后继续。', '無法驗證本機對話控制端。請重新連接 agentTools 遠端控制後繼續。', 'ローカルの会話の制御元を確認できませんでした。agentTools のリモート操作に再接続してから続行してください。', 'Die lokale Unterhaltungssteuerung konnte nicht geprüft werden. Verbinde die agentTools-Fernsteuerung erneut, bevor du fortfährst.'],
  ['Cannot connect to the existing Codex application IPC.', '无法连接现有 Codex 应用的 IPC。', '無法連接現有 Codex 應用程式的 IPC。', '既存の Codex アプリの IPC に接続できません。', 'Die IPC-Verbindung zur laufenden Codex-Anwendung konnte nicht hergestellt werden.'],
  ['The local conversation owner could not be verified. Reconnect before continuing.', '无法验证本机会话控制方。请重新连接后继续。', '無法驗證本機對話控制端。請重新連接後繼續。', 'ローカルの会話の制御元を確認できませんでした。再接続してから続行してください。', 'Die lokale Unterhaltungssteuerung konnte nicht geprüft werden. Verbinde dich erneut, bevor du fortfährst.'],
  ['Codex did not return detailed conversation history.', 'Codex 未返回详细会话历史。', 'Codex 未傳回詳細對話記錄。', 'Codex から詳細な会話履歴が返されませんでした。', 'Codex hat keinen detaillierten Unterhaltungsverlauf zurückgegeben.'],
  ['Codex did not return the latest conversation turn.', 'Codex 未返回会话的最新轮次。', 'Codex 未傳回對話的最新回合。', 'Codex から会話の最新ターンが返されませんでした。', 'Codex hat den neuesten Gesprächsschritt nicht zurückgegeben.']
]) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
}

for (const [key, zh, tw, ja, de] of [
  ['Status unknown', '状态未知', '狀態未知', '状態不明', 'Status unbekannt'],
  ['The original application changed. Review the current request before answering.', '原应用连接已变化，请查看当前请求后再回答。', '原應用程式連線已變更，請查看目前請求後再回答。', '元のアプリへの接続が変更されました。現在のリクエストを確認してから回答してください。', 'Die Verbindung zur ursprünglichen App hat sich geändert. Prüfe die aktuelle Anfrage vor deiner Antwort.']
]) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
}

for (const [code, value] of [['zh','在 Codex 中连接'],['zh-TW','在 Codex 中連接'],['ja','Codex で接続'],['de','In Codex verbinden']]) window.REMOTE_I18N[code]['Connect in Codex'] = value;

for (const [key, zh, tw, ja, de] of [
  ['Connect this conversation in the local Codex app to continue it.', '可查看此会话历史；继续对话前请在电脑上的 Codex 中连接，可能会切换本机当前聊天。', '可查看此對話記錄；繼續前請在電腦上的 Codex 中連接，可能會切換本機目前的聊天。', '履歴は閲覧できます。続行するにはパソコンの Codex で接続してください。表示中のチャットが切り替わる場合があります。', 'Der Verlauf ist lesbar. Verbinde die Unterhaltung zum Fortsetzen in Codex auf deinem Computer; dabei kann der lokale Chat wechseln.'],
  ['Open this conversation in Codex to connect.', '请在电脑上的 Codex 中连接此会话，可能会切换本机当前聊天。', '請在電腦上的 Codex 中連接此對話，可能會切換本機目前的聊天。', 'パソコンの Codex で接続してください。表示中のチャットが切り替わる場合があります。', 'Verbinde diese Unterhaltung in Codex auf deinem Computer; dabei kann der lokale Chat wechseln.'],
  ['Open this conversation in the original VS Code window to continue it.', '请在原 VS Code 窗口中打开此会话后继续。', '請在原 VS Code 視窗中開啟此對話後繼續。', '続行するには、元の VS Code ウィンドウでこの会話を開いてください。', 'Öffne diese Unterhaltung zum Fortsetzen im ursprünglichen VS-Code-Fenster.'],
  ['Connecting this conversation in Codex…', '正在电脑上的 Codex 中连接此会话…', '正在電腦上的 Codex 中連接此對話…', 'パソコンの Codex でこの会話に接続中…', 'Diese Unterhaltung wird in Codex auf deinem Computer verbunden…'],
  ['Retry connection', '重试连接', '重試連線', '接続を再試行', 'Verbindung erneut versuchen'],
  ['Connection failed. Retry here to connect this conversation in Codex. Your draft is preserved.', '连接未完成，请在这里重试连接此会话；草稿已保留。', '連線尚未完成，請在這裡重試連接此對話；草稿已保留。', '接続が完了しませんでした。ここで再試行して Codex のこの会話に接続できます。下書きは保持されています。', 'Die Verbindung wurde nicht hergestellt. Versuche es hier erneut, um diese Unterhaltung in Codex zu verbinden. Dein Entwurf bleibt erhalten.'],
  ['Codex control is not connected', 'Codex 控制尚未连接', 'Codex 控制尚未連接', 'Codex 操作は未接続', 'Codex-Steuerung nicht verbunden'],
  ['Codex is still opening this conversation.', 'Codex 仍在打开此会话，请稍后重试连接。', 'Codex 仍在開啟此對話，請稍後重試連線。', 'Codex はこの会話を開いています。少し待って接続を再試行してください。', 'Codex öffnet diese Unterhaltung noch. Versuche die Verbindung gleich erneut.'],
  ['Watching the original app. Its control connection is unavailable.', '正在查看原应用输出，控制连接暂不可用。', '正在查看原應用程式輸出，控制連線暫時無法使用。', '元のアプリの出力を表示しています。操作接続は現在利用できません。', 'Die Ausgabe der ursprünglichen App wird angezeigt. Die Steuerungsverbindung ist derzeit nicht verfügbar.'],
  ['Connected to Codex App.', '已连接 Codex App。', '已連接 Codex App。', 'Codex App に接続しています。', 'Mit Codex App verbunden.'],
  ['Connected to VS Code.', '已连接 VS Code。', '已連接 VS Code。', 'VS Code に接続しています。', 'Mit VS Code verbunden.'],
  ['The original application disconnected.', '原应用已断开，草稿已保留。', '原應用程式已斷開，草稿已保留。', '元のアプリが切断されました。下書きは保持されています。', 'Die ursprüngliche App wurde getrennt. Dein Entwurf bleibt erhalten.'],
  ['The Codex application bridge is disconnected.', 'Codex App 连接已断开，草稿已保留。', 'Codex App 連線已斷開，草稿已保留。', 'Codex App への接続が切断されました。下書きは保持されています。', 'Die Verbindung zu Codex App wurde getrennt. Dein Entwurf bleibt erhalten.'],
  ['The Codex application state is being synchronized.', '正在同步 Codex App 状态，请稍后重试。', '正在同步 Codex App 狀態，請稍後重試。', 'Codex App の状態を同期中です。しばらくしてから再試行してください。', 'Der Status von Codex App wird synchronisiert. Versuche es gleich erneut.'],
  ['The original Codex conversation owner is unavailable.', '此会话尚未在原 Codex 应用中连接；历史可查看，继续前请连接。', '此對話尚未在原 Codex 應用程式中連接；可查看記錄，繼續前請先連接。', '元の Codex アプリでこの会話は未接続です。履歴は閲覧できます。続行するには接続してください。', 'Diese Unterhaltung ist in der ursprünglichen Codex-App nicht verbunden. Der Verlauf ist lesbar; verbinde sie zum Fortsetzen.'],
  ['The Codex application uses an unsupported IPC version.', '当前 Codex App 版本暂不支持远程控制，请更新 agentTools 后重试。', '目前 Codex App 版本暫不支援遠端控制，請更新 agentTools 後重試。', 'この Codex App のバージョンではリモート操作を利用できません。agentTools を更新して再試行してください。', 'Diese Codex-App-Version unterstützt die Remote-Steuerung nicht. Aktualisiere agentTools und versuche es erneut.'],
  ['Open this conversation in the local Codex application first.', '请先在电脑上的 Codex 中连接此会话。', '請先在電腦上的 Codex 中連接此對話。', '先にパソコンの Codex でこの会話に接続してください。', 'Verbinde diese Unterhaltung zuerst in Codex auf deinem Computer.'],
  ['Archived', '已归档', '已封存', 'アーカイブ済み', 'Archiviert'],
  ['Archived conversation', '已归档会话', '已封存對話', 'アーカイブ済みの会話', 'Archivierte Unterhaltung'],
  ['This conversation is archived in Codex.', '此会话已在 Codex 中归档。', '此對話已在 Codex 中封存。', 'この会話は Codex でアーカイブされています。', 'Diese Unterhaltung ist in Codex archiviert.'],
  ['This conversation is archived in Codex. Your unsent draft is preserved.', '此会话已在 Codex 中归档，未发送的草稿和附件已保留。', '此對話已在 Codex 中封存，未傳送的草稿與附件已保留。', 'この会話は Codex でアーカイブされています。未送信の下書きと添付ファイルは保持されています。', 'Diese Unterhaltung ist in Codex archiviert. Dein ungesendeter Entwurf und die Anhänge bleiben erhalten.'],
  ['Unable to verify the conversation archive status. Refresh to retry.', '暂时无法确认会话归档状态，已暂停控制。请点击刷新重试，草稿已保留。', '暫時無法確認對話封存狀態，已暫停控制。請按重新整理重試，草稿已保留。', '会話のアーカイブ状態を確認できないため操作を停止しました。更新して再試行してください。下書きは保持されています。', 'Der Archivstatus konnte nicht geprüft werden. Die Steuerung ist pausiert. Aktualisiere zum Wiederholen; dein Entwurf bleibt erhalten.']
]) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
}

for(const code of ['zh','zh-TW','ja','de']){
  window.REMOTE_I18N[code]['Cannot read the Codex conversation archive state. Refresh after the local index is available.']=window.REMOTE_I18N[code]['Unable to verify the conversation archive status. Refresh to retry.'];
  window.REMOTE_I18N[code]['History is available. Connect this conversation in the local Codex app to continue; this may switch the local conversation.']=window.REMOTE_I18N[code]['Connect this conversation in the local Codex app to continue it.'];
}

for (const [key, zh, tw, ja, de] of [
  ['Resize sidebar', '调整侧边栏宽度', '調整側邊欄寬度', 'サイドバーの幅を調整', 'Breite der Seitenleiste ändern'],
  ['Resize right panel', '调整右侧面板宽度', '調整右側面板寬度', '右パネルの幅を調整', 'Breite des rechten Bereichs ändern'],
  ['Collapse sidebar', '收起侧边栏', '收合側邊欄', 'サイドバーを折りたたむ', 'Seitenleiste einklappen'],
  ['Expand sidebar', '展开侧边栏', '展開側邊欄', 'サイドバーを展開', 'Seitenleiste ausklappen'],
  ['Use arrow keys to resize. Home for minimum width, End for maximum width.', '使用左右方向键调整宽度。Home 调到最窄，End 调到最宽。', '使用左右方向鍵調整寬度。Home 調到最窄，End 調到最寬。', '左右の矢印キーで幅を調整。Home で最小、End で最大にします。', 'Mit den Pfeiltasten die Breite ändern. Home für die minimale, End für die maximale Breite.']
]) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
}

for (const [key, zh, tw, ja, de] of [
  ['Waiting in original app', '原应用等待回答', '原應用程式等待回答', '元のアプリで回答待ち', 'Ursprüngliche App wartet auf Antwort'],
  ['The original application is waiting for an answer. Respond there while remote control is unavailable.', '原应用正在等待回答，远程控制暂不可用时请在原应用中处理。', '原應用程式正在等待回答，遠端控制暫時無法使用時請在原應用程式中處理。', '元のアプリが回答を待っています。リモート操作を利用できない間は元のアプリで回答してください。', 'Die ursprüngliche App wartet auf eine Antwort. Antworte dort, solange die Remote-Steuerung nicht verfügbar ist.']
]) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
}

for (const [key, zh, tw, ja, de] of [
  ['Use Codex App settings', '使用 Codex App 设置', '使用 Codex App 設定', 'Codex App の設定を使用', 'Einstellungen von Codex App verwenden'],
  ['Custom permissions', '自定义权限', '自訂權限', 'カスタム権限', 'Benutzerdefinierte Berechtigungen'],
  ['Choose a permission mode before sending.', '请先明确选择权限模式，再发送消息。', '請先明確選擇權限模式，再傳送訊息。', '送信する前に権限モードを選択してください。', 'Wähle vor dem Senden einen Berechtigungsmodus.'],
  ['Saving settings…', '正在保存设置…', '正在儲存設定…', '設定を保存中…', 'Einstellungen werden gespeichert…'],
  ['Unable to save conversation settings.', '无法保存会话设置。', '無法儲存會話設定。', '会話の設定を保存できません。', 'Die Unterhaltungseinstellungen konnten nicht gespeichert werden.'],
  ['Run new conversations in', '新会话的执行位置', '新會話的執行位置', '新しい会話の実行先', 'Neue Unterhaltungen ausführen in'],
  ['agentTools engine', 'agentTools 执行器', 'agentTools 執行器', 'agentTools エンジン', 'agentTools-Engine'],
  ['Create and run in the Codex App on your computer.', '在电脑上的 Codex App 中创建并运行。', '在電腦上的 Codex App 中建立並執行。', 'パソコンの Codex App で作成して実行します。', 'In der Codex App auf deinem Computer erstellen und ausführen.'],
  ['Run with the agentTools engine and synchronize with Codex App.', '由 agentTools 执行，并同步给 Codex App。', '由 agentTools 執行，並同步至 Codex App。', 'agentTools で実行し、Codex App と同期します。', 'Mit agentTools ausführen und mit Codex App synchronisieren.']
]) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
}

for (const [code, value] of [
  ['zh', '暂不能新建原生会话，请到 agentTools 的“远程连接”页检查 Codex App 状态。'],
  ['zh-TW', '暫時無法建立原生對話，請到 agentTools 的「遠端連線」頁檢查 Codex App 狀態。'],
  ['ja', 'ネイティブ会話を作成できません。agentTools の「リモート接続」で Codex App の状態を確認してください。'],
  ['de', 'Native Unterhaltungen sind nicht verfügbar. Prüfe Codex App unter „Remote-Verbindung“ in agentTools.']
]) window.REMOTE_I18N[code]['Native conversation creation is unavailable. Open Remote connection in agentTools to check Codex App.'] = value;

for (const [key, zh, tw, ja, de] of [
  ['Background conversations are unavailable. Update agentTools on your computer and reconnect.', '后台会话暂不可用，请更新电脑上的 agentTools 后重新连接。', '背景對話暫時無法使用，請更新電腦上的 agentTools 後重新連線。', 'バックグラウンドの会話を利用できません。パソコンの agentTools を更新して再接続してください。', 'Hintergrund-Unterhaltungen sind nicht verfügbar. Aktualisiere agentTools auf deinem Computer und verbinde dich erneut.'],
  ['Connecting this conversation…', '正在连接此会话…', '正在連接此對話…', 'この会話に接続中…', 'Unterhaltung wird verbunden…'],
  ['Connection failed. Your draft is preserved. Retry the connection.', '连接未完成，草稿已保留。请重试连接。', '連線尚未完成，草稿已保留。請重試連線。', '接続できませんでした。下書きは保持されています。接続を再試行してください。', 'Verbindung fehlgeschlagen. Dein Entwurf bleibt erhalten. Versuche es erneut.'],
  ['Connect', '连接', '連線', '接続', 'Verbinden'],
  ['Open in desktop Codex', '在电脑的 Codex 中打开', '在電腦的 Codex 中開啟', 'パソコンの Codex で開く', 'In Desktop-Codex öffnen'],
  ['Connect without switching the desktop conversation.', '连接此会话，不切换电脑上当前的聊天。', '連接此對話，不切換電腦上目前的聊天。', 'パソコンで表示中の会話を切り替えずに接続します。', 'Verbinden, ohne die Unterhaltung auf dem Desktop zu wechseln.'],
  ['History is available. Connect this conversation in the background to continue without switching the desktop chat.', '历史已加载。后台连接此会话后即可继续，不会切换电脑当前的聊天。', '記錄已載入。在背景連接此對話後即可繼續，不會切換電腦目前的聊天。', '履歴を読み込みました。バックグラウンドで接続すると、パソコンで表示中のチャットを切り替えずに続行できます。', 'Der Verlauf ist verfügbar. Verbinde die Unterhaltung im Hintergrund, um fortzufahren, ohne den Desktop-Chat zu wechseln.'],
  ['This opens the conversation in desktop Codex and may switch its current chat.', '将在电脑的 Codex 中打开此会话，可能会切换电脑当前的聊天。', '將在電腦的 Codex 中開啟此對話，可能會切換電腦目前的聊天。', 'パソコンの Codex でこの会話を開きます。表示中のチャットが切り替わる場合があります。', 'Öffnet diese Unterhaltung in Desktop-Codex und kann den dort angezeigten Chat wechseln.']
]) {
  for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
}

for (const [key, zh, tw, ja, de] of [
  ['Model and reasoning', '模型与思考强度', '模型與思考強度', 'モデルと思考レベル', 'Modell und Denkaufwand'],
  ['Reset reasoning effort', '恢复默认思考强度', '恢復預設思考強度', '思考レベルを既定値に戻す', 'Denkaufwand zurücksetzen'],
  ['Context usage', '上下文用量', '上下文用量', 'コンテキスト使用量', 'Kontextnutzung'],
  ['Used tokens', '已使用 token', '已使用 token', '使用済みトークン', 'Verwendete Token'],
  ['Context window', '上下文窗口', '上下文視窗', 'コンテキストウィンドウ', 'Kontextfenster'],
]) for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;

for (const [key, zh, tw, ja, de] of [
  ['Successful tools', '成功的工具', '成功的工具', '成功したツール', 'Erfolgreiche Tools'],
  ['Failed tools', '失败的工具', '失敗的工具', '失敗したツール', 'Fehlgeschlagene Tools'],
  ['Loaded records only', '仅统计已加载记录', '僅統計已載入記錄', '読み込み済みの記録のみ', 'Nur geladene Einträge'],
  ['Copy turn answer', '复制本轮回答', '複製本回合回答', 'このターンの回答をコピー', 'Antwort dieses Durchlaufs kopieren'],
  ['Copy answer', '复制整条回答', '複製完整回答', '回答全体をコピー', 'Gesamte Antwort kopieren'],
  ['Copy command', '复制命令', '複製指令', 'コマンドをコピー', 'Befehl kopieren'],
  ['Copy output', '复制输出', '複製輸出', '出力をコピー', 'Ausgabe kopieren'],
  ['Copy diff', '复制差异', '複製差異', '差分をコピー', 'Diff kopieren'],
  ['Download', '下载', '下載', 'ダウンロード', 'Herunterladen'],
  ['Mode', '模式', '模式', 'モード', 'Modus'],
  ['Default', '默认', '預設', '既定', 'Standard'],
  ['Reconnecting…', '正在重新连接…', '正在重新連線…', '再接続中…', 'Verbindung wird wiederhergestellt…'],
  ['Connection restored', '连接已恢复', '連線已恢復', '接続が復旧しました', 'Verbindung wiederhergestellt'],
  ['Model retries', '模型请求重试记录', '模型請求重試記錄', 'モデルリクエストの再試行履歴', 'Wiederholungen der Modellanfrage'],
  ['Automatic model retry', '模型请求自动重试', '模型請求自動重試', 'モデルリクエストの自動再試行', 'Automatische Wiederholung der Modellanfrage'],
  ['Error', '错误', '錯誤', 'エラー', 'Fehler'],
  ['Error code', '错误代码', '錯誤代碼', 'エラーコード', 'Fehlercode'],
  ['The model request is retrying automatically.', '模型请求正在自动重试。', '模型請求正在自動重試。', 'モデルリクエストを自動的に再試行しています。', 'Die Modellanfrage wird automatisch erneut versucht.'],
  ['No automatic retry is currently reported.', '当前未收到自动重试状态。', '目前未收到自動重試狀態。', '現在、自動再試行は報告されていません。', 'Derzeit wird kein automatischer neuer Versuch gemeldet.'],
  ['Go to failed operation', '跳到失败操作', '跳至失敗操作', '失敗した操作へ移動', 'Zum fehlgeschlagenen Vorgang'],
  ['Resource preview failed.', '资源预览失败。', '資源預覽失敗。', 'リソースのプレビューに失敗しました。', 'Ressourcenvorschau fehlgeschlagen.'],
  ['Resource unavailable: inline image exceeds the preview size limit.', '资源不可用：内联图片超过预览大小限制。', '資源無法使用：內嵌圖片超過預覽大小限制。', 'リソースを利用できません：埋め込み画像がプレビューのサイズ制限を超えています。', 'Ressource nicht verfügbar: Eingebettetes Bild überschreitet die Größenbeschränkung der Vorschau.'],
  ['Resource unavailable: unsupported inline image format.', '资源不可用：不支持此内联图片格式。', '資源無法使用：不支援此內嵌圖片格式。', 'リソースを利用できません：未対応の埋め込み画像形式です。', 'Ressource nicht verfügbar: Format des eingebetteten Bildes wird nicht unterstützt.'],
  ['Approved', '已批准', '已核准', '承認済み', 'Genehmigt'],
  ['Timed out', '已超时', '已逾時', 'タイムアウト', 'Zeitüberschreitung'],
  ['Blocked', '已阻止', '已阻止', 'ブロック済み', 'Blockiert'],
  ['Before tool use', '工具使用前', '工具使用前', 'ツール使用前', 'Vor der Toolnutzung'],
  ['Permission request', '权限请求', '權限請求', '権限リクエスト', 'Berechtigungsanfrage'],
  ['After tool use', '工具使用后', '工具使用後', 'ツール使用後', 'Nach der Toolnutzung'],
  ['Before context compaction', '上下文压缩前', '上下文壓縮前', 'コンテキスト圧縮前', 'Vor der Kontextkomprimierung'],
  ['After context compaction', '上下文压缩后', '上下文壓縮後', 'コンテキスト圧縮後', 'Nach der Kontextkomprimierung'],
  ['Session started', '会话已开始', '對話已開始', 'セッション開始', 'Sitzung gestartet'],
  ['Session ended', '会话已结束', '對話已結束', 'セッション終了', 'Sitzung beendet'],
  ['User message submitted', '用户消息已提交', '使用者訊息已提交', 'ユーザーメッセージ送信済み', 'Benutzernachricht übermittelt'],
  ['Subagent started', '子智能体已启动', '子代理已啟動', 'サブエージェント開始', 'Unteragent gestartet'],
  ['Subagent stopped', '子智能体已停止', '子代理已停止', 'サブエージェント停止', 'Unteragent gestoppt'],
  ['Stop', '停止', '停止', '停止', 'Stoppen'],
  ['Interrupt', '中断', '中斷', '中断', 'Unterbrechen'],
  ['Synchronous', '同步执行', '同步執行', '同期実行', 'Synchron'],
  ['Asynchronous', '异步执行', '非同步執行', '非同期実行', 'Asynchron'],
  ['MCP tool', 'MCP 工具', 'MCP 工具', 'MCP ツール', 'MCP-Tool'],
  ['Prompt', '提示词', '提示詞', 'プロンプト', 'Prompt'],
  ['Warning', '警告', '警告', '警告', 'Warnung'],
  ['Feedback', '反馈', '回饋', 'フィードバック', 'Rückmeldung'],
  ['Critical', '严重', '嚴重', '重大', 'Kritisch'],
  ['Execute program', '执行程序', '執行程式', 'プログラム実行', 'Programm ausführen'],
  ['Apply patch', '应用补丁', '套用修補', 'パッチ適用', 'Patch anwenden'],
  ['Network access', '网络访问', '網路存取', 'ネットワークアクセス', 'Netzwerkzugriff'],
  ['MCP tool call', 'MCP 工具调用', 'MCP 工具呼叫', 'MCP ツール呼び出し', 'MCP-Toolaufruf'],
  ['Request permissions', '请求权限', '請求權限', '権限を要求', 'Berechtigungen anfordern'],
  ['Saved position is in older history. Load older messages to restore it.', '保存的阅读位置在更早历史中，请加载更早消息后恢复。', '儲存的閱讀位置在更早歷史中，請載入更早訊息後恢復。', '保存した位置は以前の履歴にあります。以前のメッセージを読み込むと復元できます。', 'Die gespeicherte Position liegt im älteren Verlauf. Lade ältere Nachrichten, um sie wiederherzustellen.'],
  ['Trigger', '触发事件', '觸發事件', 'トリガー', 'Auslöser'],
  ['Execution mode', '执行模式', '執行模式', '実行モード', 'Ausführungsmodus'],
  ['Handler', '处理程序', '處理程式', 'ハンドラー', 'Handler'],
  ['Source', '来源', '來源', 'ソース', 'Quelle'],
  ['Action', '操作', '操作', '操作', 'Aktion'],
  ['Working directory', '工作目录', '工作目錄', '作業ディレクトリ', 'Arbeitsverzeichnis'],
  ['MCP server', 'MCP 服务', 'MCP 服務', 'MCP サーバー', 'MCP-Server'],
  ['Risk level', '风险等级', '風險等級', 'リスクレベル', 'Risikostufe'],
  ['User authorization', '用户授权', '使用者授權', 'ユーザーの許可', 'Benutzerautorisierung'],
  ['Decision source', '决策来源', '決策來源', '判断元', 'Entscheidungsquelle'],
  ['Go to related operation', '跳到关联操作', '跳至關聯操作', '関連する操作へ移動', 'Zum zugehörigen Vorgang'],
  ['Started', '开始时间', '開始時間', '開始', 'Gestartet'],
  ['Finished', '结束时间', '結束時間', '終了', 'Beendet'],
  ['Pending requests', '待处理请求', '待處理請求', '保留中のリクエスト', 'Ausstehende Anfragen'],
  ['Parent agent', '父智能体', '父代理', '親エージェント', 'Übergeordneter Agent'],
  ['Parent conversation', '父会话', '父對話', '親の会話', 'Übergeordnete Unterhaltung'],
  ['Agent task', '子任务说明', '子工作說明', 'エージェントのタスク', 'Agentenaufgabe'],
  ['Last observed operation', '最近观测到的操作', '最近觀測到的操作', '最後に観測した操作', 'Zuletzt beobachteter Vorgang'],
  ['Result summary', '结果摘要', '結果摘要', '結果の要約', 'Ergebniszusammenfassung'],
  ['Latest loaded reply', '最近已加载的回答', '最近已載入的回答', '読み込み済みの最新の回答', 'Neueste geladene Antwort'],
  ['Loaded agent operations', '已加载的智能体操作', '已載入的代理操作', '読み込み済みのエージェント操作', 'Geladene Agentenvorgänge'],
  ['Show original record', '查看原始记录', '檢視原始記錄', '元の記録を表示', 'Ursprünglichen Eintrag anzeigen'],
  ['Reading changes…', '正在读取更改…', '正在讀取變更…', '変更を読み込み中…', 'Änderungen werden gelesen…'],
  ['Artifacts', '产物', '產物', '成果物', 'Artefakte'],
  ['No artifacts in loaded messages.', '已加载消息中没有产物。', '已載入訊息中沒有產物。', '読み込み済みのメッセージに成果物はありません。', 'Keine Artefakte in den geladenen Nachrichten.'],
  ['Artifacts from loaded messages only.', '仅显示已加载消息中的产物。', '僅顯示已載入訊息中的產物。', '読み込み済みのメッセージの成果物のみ表示します。', 'Nur Artefakte aus geladenen Nachrichten.'],
  ['Jump to source', '跳到原消息', '跳至原訊息', '元のメッセージへ移動', 'Zur ursprünglichen Nachricht'],
  ['Renamed', '已重命名', '已重新命名', '名前変更', 'Umbenannt'],
  ['Diff truncated.', '差异已截断。', '差異已截斷。', '差分が省略されています。', 'Diff gekürzt.'],
  ['Resource unavailable: browser authorization required.', '资源不可用：需要浏览器授权。', '資源無法使用：需要瀏覽器授權。', 'リソースを利用できません：ブラウザーの認証が必要です。', 'Ressource nicht verfügbar: Browserautorisierung erforderlich.'],
  ['Resource unavailable: access denied.', '资源不可用：无访问权限。', '資源無法使用：沒有存取權限。', 'リソースを利用できません：アクセスが拒否されました。', 'Ressource nicht verfügbar: Zugriff verweigert.'],
  ['Resource unavailable: file or attachment not found.', '资源不可用：未找到文件或附件。', '資源無法使用：找不到檔案或附件。', 'リソースを利用できません：ファイルまたは添付ファイルが見つかりません。', 'Ressource nicht verfügbar: Datei oder Anhang nicht gefunden.'],
  ['Resource unavailable: the session or resource is no longer available.', '资源不可用：会话或资源已不可访问。', '資源無法使用：對話或資源已無法存取。', 'リソースを利用できません：会話またはリソースは利用できなくなりました。', 'Ressource nicht verfügbar: Sitzung oder Ressource ist nicht mehr verfügbar.'],
  ['Resource unavailable: file exceeds the size limit.', '资源不可用：文件超出大小限制。', '資源無法使用：檔案超過大小限制。', 'リソースを利用できません：ファイルがサイズ制限を超えています。', 'Ressource nicht verfügbar: Datei überschreitet die Größenbeschränkung.'],
  ['Resource unavailable: the computer or service is unavailable.', '资源不可用：电脑或服务暂不可用。', '資源無法使用：電腦或服務暫時無法使用。', 'リソースを利用できません：コンピューターまたはサービスが利用できません。', 'Ressource nicht verfügbar: Computer oder Dienst nicht verfügbar.'],
  ['Resource unavailable (HTTP {status}).', '资源不可用（HTTP {status}）。', '資源無法使用（HTTP {status}）。', 'リソースを利用できません（HTTP {status}）。', 'Ressource nicht verfügbar (HTTP {status}).'],
  ['Loaded messages and tool output only.', '仅搜索已加载消息和工具输出。', '僅搜尋已載入訊息與工具輸出。', '読み込み済みのメッセージとツール出力のみ検索します。', 'Nur geladene Nachrichten und Toolausgaben.'],
  ['matches', '条匹配', '筆符合結果', '件の一致', 'Treffer'],
  ['Showing first 100 matches. Refine your search.', '仅显示前 100 条匹配，请缩小搜索范围。', '僅顯示前 100 筆符合結果，請縮小搜尋範圍。', '最初の 100 件を表示しています。検索を絞り込んでください。', 'Die ersten 100 Treffer werden angezeigt. Grenze die Suche ein.'],
  ['Search this conversation', '搜索当前会话', '搜尋目前對話', 'この会話を検索', 'Diese Unterhaltung durchsuchen'],
  ['Search loaded messages', '搜索已加载消息', '搜尋已載入訊息', '読み込み済みのメッセージを検索', 'Geladene Nachrichten durchsuchen'],
  ['Filter loaded records', '筛选已加载记录', '篩選已載入記錄', '読み込み済みの記録を絞り込む', 'Geladene Einträge filtern'],
  ['All records', '所有记录', '所有記錄', 'すべての記録', 'Alle Einträge'],
  ['Computer connection', '电脑连接', '電腦連線', 'コンピューターの接続', 'Computerverbindung'],
  ['Computer online', '电脑在线', '電腦在線', 'コンピューターがオンライン', 'Computer online'],
  ['Live stream', '网页实时流', '網頁即時串流', 'ページのライブストリーム', 'Live-Stream der Seite'],
  ['Live stream closed', '网页实时流已关闭', '網頁即時串流已關閉', 'ページのライブストリームは閉じています', 'Live-Stream der Seite geschlossen'],
  ['Execution owner', '执行方状态', '執行方狀態', '実行元の状態', 'Status der Ausführungsinstanz'],
  ['Last successful sync', '最近成功同步', '最近成功同步', '前回の同期成功', 'Letzte erfolgreiche Synchronisierung'],
  ['Sync time is observed by this browser, not task execution time.', '同步时间由当前浏览器观测，不代表任务执行时间。', '同步時間由目前瀏覽器觀測，不代表工作執行時間。', '同期時刻はこのブラウザーの観測時刻であり、タスクの実行時刻ではありません。', 'Die Synchronisierungszeit wurde von diesem Browser beobachtet und ist keine Ausführungszeit der Aufgabe.'],
  ['Reconnecting the page stream does not retry the model request.', '网页流重新连接不会重试模型请求。', '網頁串流重新連線不會重試模型請求。', 'ページのストリーム再接続ではモデルリクエストは再試行されません。', 'Die erneute Verbindung des Seitenstreams startet keinen neuen Modellversuch.'],
  ['Background execution on your computer', '在本机后台执行', '在本機背景執行', 'このコンピューターでバックグラウンド実行', 'Hintergrundausführung auf deinem Computer'],
  ['Original application', '原应用执行', '原應用程式執行', '元のアプリで実行', 'Ausführung in der ursprünglichen App'],
  ['Remote execution on your computer', '在本机执行远程任务', '在本機執行遠端工作', 'このコンピューターでリモートタスクを実行', 'Remote-Aufgabe auf deinem Computer'],
  ['Observing', '只读观测中', '唯讀觀測中', '読み取り専用で監視中', 'Nur lesende Beobachtung'],
  ['Available to connect', '可连接', '可連線', '接続可能', 'Verbindung möglich'],
  ['Disconnected', '已断开', '已中斷連線', '切断済み', 'Getrennt'],
  ['Owner-reported settings', '执行方上报的设置', '執行方回報的設定', '実行元から報告された設定', 'Von der Ausführungsinstanz gemeldete Einstellungen'],
  ['Reported by the connected execution owner.', '由当前已连接的执行方上报。', '由目前已連線的執行方回報。', '接続中の実行元が報告した値です。', 'Von der verbundenen Ausführungsinstanz gemeldet.'],
  ['Last reported values; the execution owner is not currently confirmed.', '以下为上次上报值，当前尚未确认执行方连接。', '以下為上次回報值，目前尚未確認執行方連線。', '前回報告された値です。現在の実行元の接続は確認できていません。', 'Zuletzt gemeldete Werte; die Ausführungsinstanz ist derzeit nicht bestätigt.'],
  ['Page preferences · awaiting confirmation', '页面偏好 · 等待确认生效', '頁面偏好 · 等待確認生效', 'ページの設定 · 適用確認待ち', 'Seiteneinstellungen · Bestätigung ausstehend'],
  ['Catalog not loaded', '目录尚未加载', '目錄尚未載入', 'カタログは未読み込みです', 'Katalog nicht geladen'],
  ['No MCP servers reported', '未返回 MCP 服务', '未傳回 MCP 服務', 'MCP サーバーは報告されていません', 'Keine MCP-Server gemeldet'],
  ['MCP catalog unavailable', 'MCP 目录不可用', 'MCP 目錄無法使用', 'MCP カタログは利用できません', 'MCP-Katalog nicht verfügbar'],
  ['Not started', '尚未启动', '尚未啟動', '未開始', 'Nicht gestartet'],
  ['Authentication required', '需要认证', '需要驗證', '認証が必要', 'Authentifizierung erforderlich'],
  ['Cancelled', '已取消', '已取消', 'キャンセル済み', 'Abgebrochen'],
  ['Disabled', '已禁用', '已停用', '無効', 'Deaktiviert'],
  ['Authentication', '认证状态', '驗證狀態', '認証状態', 'Authentifizierung'],
  ['Not supported', '不支持', '不支援', '未対応', 'Nicht unterstützt'],
  ['Not signed in', '未登录', '未登入', '未ログイン', 'Nicht angemeldet'],
  ['Token configured', '已配置 Token', '已設定 Token', 'トークン設定済み', 'Token konfiguriert'],
  ['Signed in', '已登录', '已登入', 'ログイン済み', 'Angemeldet'],
  ['Unable to load tools', '工具读取失败', '工具讀取失敗', 'ツールを読み込めません', 'Tools konnten nicht geladen werden'],
  ['No tools reported by this server', '此服务没有返回工具', '此服務沒有傳回工具', 'このサーバーからツールは報告されていません', 'Dieser Server hat keine Tools gemeldet'],
  ['Tools not loaded', '工具尚未加载', '工具尚未載入', 'ツールは未読み込みです', 'Tools nicht geladen'],
]) for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;

for (const [code, messages] of Object.entries({
  zh: ['无法验证加密连接，请重新配对此浏览器。', '加密远程控制需要支持安全连接的浏览器。', '请在 agentTools 中生成新的加密配对密钥。'],
  'zh-TW': ['無法驗證加密連線，請重新配對此瀏覽器。', '加密遠端控制需要支援安全連線的瀏覽器。', '請在 agentTools 中產生新的加密配對金鑰。'],
  ja: ['暗号化接続を検証できません。このブラウザーを再度ペアリングしてください。', '暗号化されたリモート操作には安全なブラウザーが必要です。', 'agentTools で新しい暗号化ペアリングキーを生成してください。'],
  de: ['Die verschlüsselte Verbindung konnte nicht überprüft werden. Koppeln Sie diesen Browser erneut.', 'Die verschlüsselte Fernsteuerung erfordert einen sicheren Browser.', 'Erstellen Sie in agentTools einen neuen verschlüsselten Kopplungsschlüssel.']
})) Object.assign(window.REMOTE_I18N[code], Object.fromEntries([
  'Encrypted connection could not be verified. Pair this browser again.',
  'Encrypted remote control requires a secure browser.',
  'Generate a new encrypted pairing key in agentTools.'
].map((message, index) => [message, messages[index]])));

for (const [key, zh, tw, ja, de] of [
  ['Session information','会话信息','工作階段資訊','セッション情報','Sitzungsinformationen'],
  ['Project','项目','專案','プロジェクト','Projekt'],['Execution source','执行来源','執行來源','実行元','Ausführungsquelle'],['Connection','连接状态','連線狀態','接続状態','Verbindung'],['Task status','任务状态','工作狀態','タスク状態','Aufgabenstatus'],['Permissions','权限','權限','権限','Berechtigungen'],['Skills','技能','技能','スキル','Skills'],['Tools','工具','工具','ツール','Tools'],['Catalog errors','目录读取错误','目錄讀取錯誤','カタログ読み込みエラー','Katalogfehler'],['No entries reported','没有可用条目','沒有可用項目','項目はありません','Keine Einträge gemeldet'],
  ['Waiting for approval','等待审批','等待核准','承認待ち','Genehmigung ausstehend'],['Review request','查看请求','檢視請求','リクエストを確認','Anfrage prüfen'],['Retrying…','正在重试…','正在重試…','再試行中…','Wird erneut versucht…'],['Connection unknown','连接状态未知','連線狀態未知','接続状態不明','Verbindungsstatus unbekannt'],['Computer offline','电脑离线','電腦離線','コンピューターがオフライン','Computer offline'],['Completed','已完成','已完成','完了','Abgeschlossen'],['Status unknown','状态未知','狀態未知','状態不明','Status unbekannt'],['Output truncated','输出已截断','輸出已截斷','出力が省略されています','Ausgabe gekürzt'],
  ['Progress update','过程更新','進度更新','進捗更新','Fortschrittsmeldung'],['Partial answer','阶段性回答','階段性回答','途中の回答','Teilantwort'],['Final answer','最终回答','最終回答','最終回答','Abschlussantwort'],['Turn','轮次','回合','ターン','Durchlauf'],['Tool calls','工具调用','工具呼叫','ツール呼び出し','Toolaufrufe'],
  ['Read file','读取文件','讀取檔案','ファイルを読み込み','Datei lesen'],['Search content','搜索内容','搜尋內容','内容を検索','Inhalt durchsuchen'],['List files','列出文件','列出檔案','ファイルを一覧表示','Dateien auflisten'],['Open webpage','打开网页','開啟網頁','ウェブページを開く','Webseite öffnen'],['Find in page','页内查找','頁內尋找','ページ内を検索','Auf Seite suchen'],['Web search','网页搜索','網頁搜尋','ウェブ検索','Websuche'],['Terminal input','终端交互','終端互動','ターミナル操作','Terminaleingabe'],
  ['Open resource','打开资源','開啟資源','リソースを開く','Ressource öffnen'],['View image','查看图片','檢視圖片','画像を表示','Bild ansehen'],['Generated image','生成的图片','產生的圖片','生成画像','Erzeugtes Bild'],['Artifact','产物','產物','成果物','Artefakt'],['Resource unavailable: output truncated.','资源不可用：输出已截断。','資源無法使用：輸出已截斷。','リソースを利用できません：出力が省略されています。','Ressource nicht verfügbar: Ausgabe gekürzt.'],['Resource unavailable in the authorized project or attachments.','授权项目或附件中没有此资源。','授權專案或附件中沒有此資源。','許可されたプロジェクトまたは添付ファイルでリソースを利用できません。','Ressource im autorisierten Projekt oder Anhang nicht verfügbar.'],['Current file content','当前文件内容','目前檔案內容','現在のファイル内容','Aktueller Dateiinhalt'],
  ['All turns','所有轮次','所有回合','すべてのターン','Alle Durchläufe'],['Current turn','当前轮次','目前回合','現在のターン','Aktueller Durchlauf'],['Filter changes','筛选更改','篩選變更','変更を絞り込む','Änderungen filtern'],['File tree','文件树','檔案樹','ファイルツリー','Dateibaum'],['File list','文件列表','檔案清單','ファイル一覧','Dateiliste'],['Added','新增','新增','追加','Hinzugefügt'],['Deleted','删除','刪除','削除','Gelöscht'],['Modified','修改','修改','変更','Geändert'],['Old line','旧行','舊行','変更前の行','Alte Zeile'],['New line','新行','新行','変更後の行','Neue Zeile'],['Recorded diff','记录的差异','記錄的差異','記録された差分','Erfasster Diff'],['Historical changes','历史更改','歷史變更','過去の変更','Frühere Änderungen'],
  ['Recent request','最近请求','最近請求','直近のリクエスト','Letzte Anfrage'],['Cumulative usage','累计用量','累計用量','累積使用量','Kumulierte Nutzung'],['Total tokens','Token 总数','Token 總數','合計トークン','Tokens gesamt'],['Input tokens','输入 Token','輸入 Token','入力トークン','Eingabe-Tokens'],['Cached input tokens','缓存输入 Token','快取輸入 Token','キャッシュ入力トークン','Zwischengespeicherte Eingabe-Tokens'],['Output tokens','输出 Token','輸出 Token','出力トークン','Ausgabe-Tokens'],['Reasoning tokens','推理 Token','推理 Token','推論トークン','Reasoning-Tokens'],['Context compaction failed','上下文压缩失败','上下文壓縮失敗','コンテキスト圧縮に失敗','Kontextkomprimierung fehlgeschlagen'],['Interrupted','已中断','已中斷','中断','Unterbrochen'],['Model changed','模型已切换','模型已切換','モデル変更','Modell geändert'],['System notice','系统通知','系統通知','システム通知','Systemhinweis'],['Automatic review','自动审查','自動審查','自動レビュー','Automatische Prüfung'],['Hook','Hook','Hook','Hook','Hook'],['Create agent','创建子智能体','建立子代理','エージェントを作成','Agent erstellen'],['Send to agent','发送给智能体','傳送給代理','エージェントに送信','An Agent senden'],['Wait for agents','等待智能体','等待代理','エージェントを待機','Auf Agenten warten'],['Close agent','关闭智能体','關閉代理','エージェントを終了','Agent schließen'],['Resume agent','恢复智能体','恢復代理','エージェントを再開','Agent fortsetzen']
]) for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;

for (const [key, zh, tw, ja, de] of [
  ['Search scope','搜索范围','搜尋範圍','検索範囲','Suchbereich'],
  ['Loaded history','已加载历史','已載入歷史','読み込み済みの履歴','Geladener Verlauf'],
  ['Full history','完整历史','完整歷史','履歴全体','Vollständiger Verlauf'],
  ['Partial history','部分历史','部分歷史','一部の履歴','Teilweiser Verlauf'],
  ['Load turn index','加载轮次索引','載入回合索引','ターン一覧を読み込む','Durchlaufindex laden'],
  ['Load more turns','加载更多轮次','載入更多回合','さらにターンを読み込む','Weitere Durchläufe laden'],
  ['Turn index covers readable history.','轮次索引覆盖可读取的历史。','回合索引涵蓋可讀取的歷史。','読み取り可能な履歴のターン一覧です。','Der Durchlaufindex umfasst den lesbaren Verlauf.'],
  ['Turn index is incomplete.','轮次索引尚不完整。','回合索引尚未完整。','ターン一覧は不完全です。','Der Durchlaufindex ist unvollständig.'],
  ['Loading history index…','正在读取历史索引…','正在讀取歷史索引…','履歴一覧を読み込み中…','Verlaufsindex wird geladen…'],
  ['Search scope: full readable history.','搜索范围：可读取的完整历史。','搜尋範圍：可讀取的完整歷史。','検索範囲：読み取り可能な履歴全体。','Suchbereich: gesamter lesbarer Verlauf.'],
  ['Search scope: loaded history.','搜索范围：已读取的历史。','搜尋範圍：已讀取的歷史。','検索範囲：読み込み済みの履歴。','Suchbereich: geladener Verlauf.'],
  ['Full history search is ready.','可以搜索完整历史。','可以搜尋完整歷史。','履歴全体を検索できます。','Die Suche im vollständigen Verlauf ist bereit.'],
  ['Search history','搜索历史','搜尋歷史','履歴を検索','Verlauf durchsuchen'],
  ['Searching…','正在搜索…','正在搜尋…','検索中…','Suche läuft…'],
  ['Load more matches','加载更多结果','載入更多結果','さらに検索結果を読み込む','Weitere Treffer laden'],
  ['Results are incomplete.','结果不完整。','結果不完整。','結果は不完全です。','Die Ergebnisse sind unvollständig.'],
  ['Results are incomplete','结果不完整','結果不完整','結果は不完全です','Die Ergebnisse sind unvollständig'],
  ['Read index response is unavailable or unsupported.','索引响应不可用或版本不受支持。','索引回應無法使用或版本不受支援。','索引の応答を利用できないか、バージョンが未対応です。','Die Indexantwort ist nicht verfügbar oder wird nicht unterstützt.'],
  ['Read index response exceeds its limits.','索引响应超出读取限制。','索引回應超出讀取限制。','索引の応答が読み取り制限を超えています。','Die Indexantwort überschreitet die Lesegrenzen.'],
  ['Pagination stopped because the history cursor did not advance.','历史游标未前进，已停止继续读取。','歷史游標未前進，已停止繼續讀取。','履歴カーソルが進まなかったため、読み込みを停止しました。','Das Laden wurde angehalten, da der Verlaufscursor nicht weiterging.'],
  ['Some history could not be read. Results are incomplete.','部分历史无法读取，结果不完整。','部分歷史無法讀取，結果不完整。','一部の履歴を読み込めませんでした。結果は不完全です。','Ein Teil des Verlaufs konnte nicht gelesen werden. Die Ergebnisse sind unvollständig.'],
  ['Unable to read history index.','无法读取历史索引。','無法讀取歷史索引。','履歴一覧を読み込めません。','Der Verlaufsindex konnte nicht gelesen werden.'],
  ['Unable to load older history.','无法读取更早的历史。','無法讀取更早的歷史。','以前の履歴を読み込めません。','Älterer Verlauf konnte nicht geladen werden.'],
  ['The source is outside the loaded history. Load older messages to continue.','来源位于尚未加载的历史中，请加载更早的消息后继续。','來源位於尚未載入的歷史中，請載入更早的訊息後繼續。','参照元は未読み込みの履歴にあります。以前のメッセージを読み込んでください。','Die Quelle liegt außerhalb des geladenen Verlaufs. Lade ältere Nachrichten, um fortzufahren.'],
  ['Artifacts from readable history.','可读取历史中的产物。','可讀取歷史中的產物。','読み取り可能な履歴の成果物。','Artefakte aus dem lesbaren Verlauf.'],
  ['Load history artifacts','加载历史产物','載入歷史產物','履歴の成果物を読み込む','Verlaufsartefakte laden'],
  ['Load more artifacts','加载更多产物','載入更多產物','さらに成果物を読み込む','Weitere Artefakte laden'],
  ['Artifact type','产物类型','產物類型','成果物の種類','Artefakttyp'],
  ['All artifact types','所有产物类型','所有產物類型','すべての成果物','Alle Artefakttypen'],
  ['Available','可用','可用','利用可能','Verfügbar'],
  ['Resource was deleted.','资源已删除。','資源已刪除。','リソースは削除されています。','Die Ressource wurde gelöscht.'],
  ['Resource is outside the authorized project.','资源超出已授权项目范围。','資源超出已授權專案範圍。','リソースは許可されたプロジェクトの範囲外です。','Die Ressource liegt außerhalb des autorisierten Projekts.'],
  ['No matching artifacts in this page.','本页没有符合条件的产物。','本頁沒有符合條件的產物。','このページに一致する成果物はありません。','Auf dieser Seite gibt es keine passenden Artefakte.'],
  ['Interaction history','审批与提问历史','核准與提問歷史','承認と質問の履歴','Genehmigungs- und Frageverlauf'],
  ['Answered','已回答','已回答','回答済み','Beantwortet'],
  ['Expired','已过期','已過期','期限切れ','Abgelaufen'],
  ['Loaded records only','仅已读取的记录','僅已讀取的記錄','読み込み済みの記録のみ','Nur geladene Einträge'],
  ['Load more interaction history','加载更多审批与提问历史','載入更多核准與提問歷史','さらに承認と質問の履歴を読み込む','Weitere Genehmigungen und Fragen laden'],
  ['Agent run graph','智能体运行关系','代理執行關係','エージェントの実行関係','Agentenbeziehungen'],
  ['Load more agent history','加载更多智能体历史','載入更多代理歷史','さらにエージェント履歴を読み込む','Weitere Agentenverläufe laden'],
  ['Last activity','最近活动','最近活動','最近のアクティビティ','Letzte Aktivität'],
  ['Historical agent operations','历史智能体操作','歷史代理操作','過去のエージェント操作','Frühere Agentenoperationen'],
]) for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;

for (const [key, zh, tw, ja, de] of [
  ['Conversation index is unavailable.','会话索引不可用。','會話索引無法使用。','会話の索引を利用できません。','Der Unterhaltungsindex ist nicht verfügbar.'],
  ['The local Codex history connection is unavailable.','本机 Codex 历史连接不可用。','本機 Codex 歷史連線無法使用。','ローカル Codex の履歴接続を利用できません。','Die lokale Codex-Verbindung zum Verlauf ist nicht verfügbar.'],
  ['Invalid conversation index cursor.','会话索引游标无效。','會話索引游標無效。','会話索引のカーソルが無効です。','Der Cursor des Unterhaltungsindex ist ungültig.'],
  ['Invalid or stale conversation index cursor. Refresh the index.','会话索引游标无效或已过期，请刷新索引。','會話索引游標無效或已過期，請重新整理索引。','会話索引のカーソルが無効または古くなっています。索引を更新してください。','Der Cursor des Unterhaltungsindex ist ungültig oder veraltet. Aktualisiere den Index.'],
  ['Conversation index changed while reading. Refresh the index.','读取期间会话索引已变化，请刷新索引。','讀取期間會話索引已變更，請重新整理索引。','読み込み中に会話索引が変更されました。索引を更新してください。','Der Unterhaltungsindex wurde beim Lesen geändert. Aktualisiere den Index.'],
  ['Invalid conversation search request.','会话搜索请求无效。','會話搜尋請求無效。','会話検索のリクエストが無効です。','Die Suchanfrage für die Unterhaltung ist ungültig.'],
  ['Codex did not return a turn index.','Codex 未返回轮次索引。','Codex 未傳回回合索引。','Codex はターン一覧を返しませんでした。','Codex hat keinen Durchlaufindex zurückgegeben.'],
  ['Interaction history is unavailable for this conversation.','此会话的审批与提问历史不可用。','此會話的核准與提問歷史無法使用。','この会話の承認と質問の履歴を利用できません。','Der Genehmigungs- und Frageverlauf dieser Unterhaltung ist nicht verfügbar.'],
]) for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;

for (const [key, zh, tw, ja, de] of [
  ['Resource exceeds the 20 MB limit.','资源超过 20 MB 限制。','資源超過 20 MB 限制。','リソースが 20 MB の制限を超えています。','Die Ressource überschreitet die Grenze von 20 MB.'],
  ['This artifact is unavailable. Refresh the artifact index.','此产物不可用，请刷新产物索引。','此產物無法使用，請重新整理產物索引。','この成果物を利用できません。成果物一覧を更新してください。','Dieses Artefakt ist nicht verfügbar. Aktualisiere den Artefaktindex.'],
  ['This artifact is unavailable or is outside the current project.','此产物不可用或位于当前项目之外。','此產物無法使用或位於目前專案之外。','この成果物を利用できないか、現在のプロジェクトの範囲外です。','Dieses Artefakt ist nicht verfügbar oder liegt außerhalb des aktuellen Projekts.'],
  ['This artifact is unavailable or exceeds the 20 MB resource limit.','此产物不可用或超过 20 MB 资源限制。','此產物無法使用或超過 20 MB 資源限制。','この成果物を利用できないか、20 MB の制限を超えています。','Dieses Artefakt ist nicht verfügbar oder überschreitet die Ressourcengrenze von 20 MB.'],
  ['This artifact could not be read.','无法读取此产物。','無法讀取此產物。','この成果物を読み込めませんでした。','Dieses Artefakt konnte nicht gelesen werden.'],
  ['The agent graph changed while reading. Refresh the index.','读取期间智能体关系已变化，请刷新索引。','讀取期間代理關係已變更，請重新整理索引。','読み込み中にエージェントの関係が変更されました。索引を更新してください。','Die Agentenbeziehungen wurden beim Lesen geändert. Aktualisiere den Index.'],
  ['Some agent history is unavailable.','部分智能体历史不可用。','部分代理歷史無法使用。','一部のエージェント履歴を利用できません。','Ein Teil des Agentenverlaufs ist nicht verfügbar.'],
]) for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;

for (const [key, zh, tw, ja, de] of [
 ['Unable to preserve the creation request. Review your computer before creating another conversation.','无法保存创建回执，请先在电脑上确认结果再新建会话。','無法儲存建立回執，請先在電腦上確認結果再新增對話。','作成リクエストを保存できません。別の会話を作る前にパソコンで結果を確認してください。','Die Erstellungsanfrage konnte nicht gespeichert werden. Prüfe das Ergebnis am Computer, bevor du eine weitere Unterhaltung erstellst.'],
 ['The previous creation is unconfirmed. Restore its settings and retry, or review the conversation on your computer.','上次创建结果尚未确认，请恢复原设置后重试，或在电脑上查看会话。','上次建立結果尚未確認，請恢復原設定後重試，或在電腦上查看對話。','前回の作成結果が未確認です。元の設定に戻して再試行するか、パソコンで会話を確認してください。','Die vorherige Erstellung ist unbestätigt. Stelle die ursprünglichen Einstellungen wieder her und versuche es erneut, oder prüfe die Unterhaltung am Computer.'],
 ['Create with default mode and permissions, then change them after connecting. Your draft is preserved.','请先用默认模式和权限创建，连接后再修改；草稿已保留。','請先用預設模式和權限建立，連線後再修改；草稿已保留。','既定のモードと権限で作成し、接続後に変更してください。下書きは保持されています。','Erstelle mit Standardmodus und Standardberechtigungen und ändere sie nach dem Verbinden. Dein Entwurf bleibt erhalten.'],
 ['The conversation was already created. Review it before sending your message.','会话已经创建，请先确认该会话，再明确发送消息。','對話已經建立，請先確認該對話，再明確傳送訊息。','会話は既に作成されています。メッセージを送る前に会話を確認してください。','Die Unterhaltung wurde bereits erstellt. Prüfe sie, bevor du deine Nachricht sendest.'],
]) for (const [code,value] of [['zh',zh],['zh-TW',tw],['ja',ja],['de',de]]) window.REMOTE_I18N[code][key]=value;


for (const [key, zh, tw, ja, de] of [
  ['Latest', '最新', '最新', '最新', 'Zuletzt'],
  ['Current', '当前', '目前', '現在', 'Aktuell'],
]) for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;

for (const [key, zh, tw, ja, de] of [
  ['Workspace inspector', '工作区详情', '工作區詳情', 'ワークスペースの詳細', 'Arbeitsbereichdetails'],
  ['Details', '详情', '詳情', '詳細', 'Details'],
  ['Session', '会话', '對話', 'セッション', 'Sitzung'],
  ['Diff', 'Diff', 'Diff', '差分', 'Diff'],
  ['Logs', '日志', '日誌', 'ログ', 'Protokoll'],
  ['Task details', '任务详情', '任務詳情', 'タスクの詳細', 'Aufgabendetails'],
  ['Tool usage', '工具使用', '工具使用', 'ツールの使用', 'Toolnutzung'],
  ['Changed files', '修改的文件', '修改的檔案', '変更したファイル', 'Geänderte Dateien'],
  ['View all', '查看全部', '檢視全部', 'すべて表示', 'Alle anzeigen'],
  ['Execution log', '执行日志', '執行日誌', '実行ログ', 'Ausführungsprotokoll'],
  ['No tool calls in loaded messages.', '已加载消息中没有工具调用。', '已載入的訊息中沒有工具呼叫。', '読み込み済みのメッセージにツール呼び出しはありません。', 'Keine Toolaufrufe in geladenen Nachrichten.'],
  ['No execution records in loaded messages.', '已加载消息中没有执行记录。', '已載入的訊息中沒有執行記錄。', '読み込み済みのメッセージに実行記録はありません。', 'Keine Ausführungseinträge in geladenen Nachrichten.'],
]) for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;

for (const [key, zh, tw, ja, de] of [
  ['No pinned conversations.', '暂无置顶会话。', '尚無置頂對話。', 'ピン留めした会話はありません。', 'Keine angehefteten Unterhaltungen.'],
  ['No active conversations.', '暂无进行中的会话。', '尚無進行中的對話。', '進行中の会話はありません。', 'Keine aktiven Unterhaltungen.'],
  ['No shared projects.', '暂无共享项目。', '尚無共用專案。', '共有プロジェクトはありません。', 'Keine freigegebenen Projekte.'],
]) for (const [code, value] of [['zh', zh], ['zh-TW', tw], ['ja', ja], ['de', de]]) window.REMOTE_I18N[code][key] = value;
