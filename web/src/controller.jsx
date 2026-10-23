import { createReading } from "./features/reading";
import {
  loadedItems,
  itemResources,
  searchItems,
} from "./features/presentation";
import { bindWorkspace } from "./features/bindings";
import { createAgentLifecycle } from "./features/agents";
import { agentFor } from "./agents/registry";
import { createSessions } from "./features/sessions";
import { createOwners } from "./features/owners";
import { createLifecycle } from "./features/lifecycle";
import { createDevices } from "./features/devices";
import { createComposer } from "./features/composer";
import { createMarkdown } from "./features/markdown";
import { createConversation } from "./features/conversation";
import { createSubagents } from "./features/subagents";
import { createFiles } from "./features/files";
import { createQueue } from "./features/queue";
import { createApprovals } from "./features/approvals";
import { createSettings } from "./features/settings";
import { createAttachments } from "./features/attachments";
import { createSuggestions } from "./features/suggestions";
import { createStream } from "./features/stream";
import { createWorkspace } from "./features/workspace";
import { createMenus } from "./features/menus";
import { createAPI } from "./transport/api";
import { renderView, clearView } from "./render";
import { TurnStatus } from "./components/ui/turn-status";
import { Button } from "./components/ui/button";
import { RemoteIcon as Icon } from "./components/RemoteIcon";
export function startRemote() {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const supportedLanguages = ["en", "zh", "zh-TW", "ja", "de"];
  const browserLanguage = navigator.language || "en";
  let lang =
    localStorage.getItem("codex.remote.language") ||
    (/^zh-(TW|HK|Hant)/i.test(browserLanguage)
      ? "zh-TW"
      : /^zh/i.test(browserLanguage)
        ? "zh"
        : /^ja/i.test(browserLanguage)
          ? "ja"
          : /^de/i.test(browserLanguage)
            ? "de"
            : "en");
  if (!supportedLanguages.includes(lang)) lang = "en";
  const getAgent = () => agentFor(state.catalog.agent);
  const t = (text) => {
    const value = window.REMOTE_I18N[lang]?.[text] || text;
    return getAgent().id === "codex"
      ? value
      : value.replaceAll("Codex", getAgent().name);
  };
  function Action({ children, action, ...props }) {
    return (
      <Button
        type="button"
        variant={props.className?.includes("primary") ? "glass" : "ghost"}
        {...props}
        onClick={(event) => run(action, event.currentTarget)}
      >
        {children}
      </Button>
    );
  }
  function labelButton(id, text, symbol) {
    renderView(
      $(id),
      <>
        {symbol && <Icon name={symbol} />}
        <span>{t(text)}</span>
        {["model", "effort"].includes(id) && <Icon name="chevron" />}
      </>,
    );
  }

  const state = {
    device: null,
    deviceTimer: null,
    deviceChecking: false,
    project: "",
    listProject: "",
    session: null,
    selected: "",
    generation: 0,
    listSeq: 0,
    detailSeq: 0,
    optionsSeq: 0,
    next: 0,
    sessions: [],
    projects: [],
    catalog: {
      models: [],
      modes: [],
      skills: [],
      tools: [],
      permissions: [],
      capabilities: {},
    },
    prefs: {},
    settingsMutation: null,
    attachments: [],
    skills: [],
    mentions: [],
    tools: [],
    running: false,
    sending: false,
    uploading: 0,
    turnID: "",
    requestKey: "",
    dismissedKey: "",
    currentRequests: [],
    live: {},
    history: [],
    historyCursor: "",
    historyAnchor: "",
    historyPagingStarted: false,
    historyBoundary: "",
    prefsLoaded: false,
    timer: null,
    stream: null,
    streamGeneration: 0,
    streamThread: "",
    streamMode: "closed",
    liveRevision: 0,
    legacyParts: [],
    historyCut: false,
    nativeHistory: false,
    suggestionSeq: 0,
    suggestionIndex: 0,
    suggestions: [],
    suggestionToken: null,
    optionsLoaded: false,
    cwd: "",
    workspaceChanges: [],
    workspaceWarning: "",
    workspaceToken: "",
    workspaceFetch: null,
    workspaceQueued: false,
    workspaceTimer: null,
    pendingPlan: null,
    planToken: "",
    planFetch: null,
    planExecuting: false,
    previewSeq: 0,
    filesSeq: 0,
    sideTab: "changes",
    queue: [],
    queueRevision: -1,
    queuePaused: false,
    queueError: "",
    queueFetched: false,
    queueFetch: null,
    queueMutation: null,
    queueEdit: null,
    queueDraftID: "",
    queueDraftKey: "",
  };
  const reading = createReading({ state, $, getAgent });
  const jumpToItem = (id) => reading.jump(id);
  function conversationItems() {
    return [
      ...(!state.nativeHistory ? legacyItems(state.legacyParts) : []),
      ...loadedItems(state),
    ];
  }
  function turnLabel(id) {
    if (!id) return t("Unknown");
    if (id === state.live.turn_id) return t("Current turn");
    const turns = [
      ...new Set(
        conversationItems()
          .map((item) => item.turn_id)
          .filter(Boolean),
      ),
    ];
    const index = turns.indexOf(id);
    return t("Turn") + " " + (index >= 0 ? index + 1 : t("Unknown"));
  }
  function renderSearch() {
    const items = conversationItems(),
      scope = [state.device?.id, getAgent().id, state.selected].join("|");
    if ($("conversationSearch").dataset.scope !== scope) {
      $("conversationSearch").dataset.scope = scope;
      $("conversationSearch").value = "";
      $("conversationFilter").value = "all";
      $("conversationTurn").value = "";
    }
    const turns = [
        ...new Set(items.map((item) => item.turn_id).filter(Boolean)),
      ],
      selectedTurn = $("conversationTurn").value;
    renderView(
      $("conversationTurn"),
      <>
        <option value="">{t("All turns")}</option>
        {turns.map((id, index) => (
          <option key={id} value={id}>
            {t("Turn") + " " + (index + 1)}
          </option>
        ))}
      </>,
    );
    $("conversationTurn").value = turns.includes(selectedTurn)
      ? selectedTurn
      : "";
    $("conversationNavigator").hidden = !state.selected;
    const query = $("conversationSearch").value,
      filter = $("conversationFilter").value,
      active = !!query.trim() || filter !== "all" || !!selectedTurn,
      matches = searchItems(items, query, filter).filter(
        (item) => !selectedTurn || item.turn_id === selectedTurn,
      ),
      changes =
        filter === "changes"
          ? changedFiles().filter(
              (file) =>
                !file.item_id &&
                (!selectedTurn || file.turn_id === selectedTurn) &&
                (!query.trim() ||
                  (file.path + "\n" + (file.diff || ""))
                    .toLocaleLowerCase()
                    .includes(query.trim().toLocaleLowerCase())),
            )
          : [];
    renderView(
      $("conversationSearchResults"),
      active ? (
        <>
          <p className="note">
            {t("Loaded messages and tool output only.")} ·{" "}
            {matches.length + changes.length} {t("matches")}
          </p>
          {matches.slice(0, 100).map((item) => (
            <Action
              key={item.id}
              className="search-result"
              action={() => jumpToItem(item.id)}
            >
              <span>
                {t("Turn")} {turns.indexOf(item.turn_id) + 1 || t("Unknown")}
              </span>
              <span>
                {String(
                  item.text ||
                    item.data?.command ||
                    item.data?.aggregatedOutput ||
                    item.type,
                ).slice(0, 150)}
              </span>
            </Action>
          ))}
          {changes.slice(0, Math.max(0, 100 - matches.length)).map((file) => (
            <Action
              key={file.key}
              className="search-result"
              action={() => openTurnChanges(file.turn_id)}
            >
              {file.path}
            </Action>
          ))}
          {matches.length + changes.length > 100 && (
            <p className="note">
              {t("Showing first 100 matches. Refine your search.")}
            </p>
          )}
        </>
      ) : null,
    );
  }
  function renderTimeline() {
    reading.capture();
    const live = state.live,
      activeIDs = new Set((live.items || []).map((item) => item.id)),
      history = state.history.filter((item) => !activeIDs.has(item.id));
    renderItems(
      $("history"),
      [
        ...(!state.nativeHistory ? legacyItems(state.legacyParts) : []),
        ...history,
      ],
      new Set((live.items || []).map((item) => item.turn_id)),
    );
    renderItems($("live"), live.items || []);
    renderSearch();
    reading.afterRender();
  }
  const notice = (text = "") => {
    $("notice").textContent = t(text);
  };
  function translate() {
    document.documentElement.lang = lang;
    document
      .querySelectorAll('[data-icon="codex"]')
      .forEach((node) => renderView(node, <Icon name={getAgent().icon} />));
    document.querySelectorAll("[data-t]").forEach((n) => {
      n.textContent = t(n.dataset.t);
    });
    document.querySelectorAll("[data-placeholder]").forEach((n) => {
      n.placeholder = t(n.dataset.placeholder);
    });
    document.querySelectorAll("[data-label]").forEach((n) => {
      n.setAttribute("aria-label", t(n.dataset.label));
      n.title = t(n.dataset.label);
    });
    if (state.selected && state.session) {
      const title = state.session.title;
      $("title").textContent =
        title === "New session"
          ? t("New session")
          : title || t("Untitled session");
    }
    $("sidebar").setAttribute("aria-label", t("Projects and sessions"));
    $("sessions").setAttribute("aria-label", t("Sessions"));
    updateControls();
    renderSessions();
    renderProjects();
    renderDevice();
    renderQueue();
  }
  async function run(action, control) {
    if (control) control.disabled = true;
    try {
      notice();
      return await action();
    } catch (e) {
      notice(
        e.name === "AbortError"
          ? "Connection timed out. Try again."
          : e.message,
      );
    } finally {
      if (control?.isConnected) control.disabled = false;
      updateControls();
    }
  }
  function showPair() {
    reading.save();
    notice();
    clearTimeout(state.deviceTimer);
    clearTimeout(state.timer);
    clearTimeout(state.workspaceTimer);
    state.device = null;
    state.deviceConnectionUnknown = false;
    state.agentDiscovered = false;
    closeStream();
    state.sending = false;
    state.selected = "";
    state.archivedSelection = "";
    state.ownerUnavailable = false;
    state.project = "";
    state.listProject = "";
    state.session = null;
    state.sessions = [];
    state.projects = [];
    state.history = [];
    state.live = {};
    state.prefs = {};
    state.settingsMutation = null;
    state.cwd = "";
    state.optionsLoaded = false;
    state.running = false;
    state.turnID = "";
    state.requestKey = "";
    state.dismissedKey = "";
    state.generation++;
    state.listSeq++;
    state.detailSeq++;
    state.optionsSeq++;
    state.catalog = {
      models: [],
      modes: [],
      skills: [],
      tools: [],
      permissions: [],
      capabilities: {},
    };
    clearDraft();
    resetSideData();
    closeChanges();
    closeMenu();
    closeDialog();
    for (const id of ["history", "live", "filePreviewContent", "planProgress"])
      clearView($(id));
    $("title").textContent = t("New session");
    $("cwd").textContent = "";
    $("older").hidden = true;
    $("working").hidden = true;
    $("planProgress").hidden = true;
    $("search").value = "";
    $("more").hidden = true;
    $("pair").hidden = false;
    $("workspace").hidden = true;
    $("logout").hidden = true;
    for (const id of [
      "executePlanDialog",
      "permissionDialog",
      "deviceDialog",
      "sessionInfoDialog",
    ])
      if ($(id).open) $(id).close();
    renderSessions();
    renderProjects();
    renderChanges();
    updateControls();
    setNavigation(false);
  }
  function setStatus(status, requests) {
    const label = state.archivedSelection
      ? "Archived"
      : requests?.length
        ? !ownerCan(
            requests[0]?.method === "agentMessage/questions"
              ? "steer"
              : "answer",
          )
          ? "Waiting in original app"
          : ["question", "elicitation"].includes(
                getAgent().requestKind(requests[0]),
              )
            ? "Waiting for you"
            : "Waiting for approval"
        : state.live.retrying
          ? "Retrying…"
          : status === "completed"
            ? "Completed"
            : status === "inProgress" || status === "starting"
              ? "Running"
              : status === "failed"
                ? "Failed"
                : status === "interrupted"
                  ? "Interrupted"
                  : status === "idle" || !state.selected
                    ? "Ready"
                    : "Status unknown";
    $("state").textContent = t(label);
    $("state").dataset.state = status || "idle";
    const connection = state.deviceConnectionUnknown
      ? "Connection unknown"
      : state.device?.online === false
        ? "Computer offline"
        : state.live.owner?.state === "offline"
          ? "Connection unknown"
          : "";
    $("state").title = connection
      ? t("Task status") + ": " + t(label) + " · " + t(connection)
      : t("Task status") + ": " + t(label);
  }
  function selectedModel() {
    return (
      getAgent().selectedModel?.(state.catalog, state.prefs.model) ||
      (state.catalog.models || []).find(
        (model) => getAgent().modelID(model) === state.prefs.model,
      )
    );
  }
  const effortName = (value) => getAgent().effortName(value, t);
  function permissionLabel(value = state.prefs.permission) {
    return getAgent().permissionLabel(value, { ...state, nativeSettings });
  }
  function updateControls() {
    const offline = state.device?.online === false,
      noProject = !state.selected && !state.project,
      noBackgroundCreation =
        !state.selected &&
        state.optionsLoaded &&
        state.catalog.capabilities?.background_creation !== true;
    $("message").disabled = state.sending || offline || noProject;
    $("new").disabled = state.sending || offline;
    $("startChat").disabled = state.sending || offline;
    $("project").disabled = state.sending;
    $("breadcrumbProject").disabled = state.sending;
    for (const b of $("sessions").querySelectorAll("button"))
      b.disabled = state.sending;
    $("composer").hidden = !state.selected && !state.project;
    const desktopURL = state.selected
      ? getAgent().desktopURL(state.selected)
      : "";
    $("openCodex").hidden = !desktopURL;
    if (desktopURL) $("openCodex").href = desktopURL;
    else $("openCodex").removeAttribute("href");
    $("welcome").hidden = !!state.selected || !!state.archivedSelection;
    if (state.archivedSelection)
      $("title").textContent = t("Archived conversation");
    $("startChat").hidden = !state.project || !!state.archivedSelection;
    const model = selectedModel();
    labelButton(
      "model",
      getAgent().modelName(model) || state.prefs.model || "Configured model",
    );
    labelButton("effort", effortName(state.prefs.effort));
    labelButton(
      "mode",
      state.prefs.mode === "plan" ? "Plan mode" : "Default mode",
      "plan",
    );
    $("mode").dataset.active = String(state.prefs.mode === "plan");
    labelButton("permission", permissionLabel(), "shield");
    $("permission").dataset.active = String(
      state.prefs.permission === "full-access",
    );
    for (const id of ["model", "effort", "mode", "permission"])
      $(id).disabled =
        offline ||
        !ownerCan("configure") ||
        state.running ||
        state.sending ||
        !!state.settingsMutation ||
        !state.optionsLoaded;
    const queued = shouldQueue(),
      queueUnavailable = queued && !state.catalog.capabilities?.queue;
    $("send").disabled =
      noProject ||
      offline ||
      !ownerCan(queued ? "queue" : "send") ||
      state.sending ||
      !!state.queueMutation ||
      state.uploading > 0 ||
      !!state.settingsMutation ||
      queueUnavailable ||
      (!$("message").value.trim() &&
        !state.attachments.length &&
        !state.skills.length &&
        !state.mentions.length &&
        !state.tools.length);
    $("send").setAttribute("aria-label", t(queued ? "Queue message" : "Send"));
    $("send").title = t(queued ? "Queue message" : "Send");
    $("stop").hidden = !state.running;
    $("stop").disabled =
      offline || !ownerCan("interrupt") || state.sending || !state.turnID;
    $("attach").disabled =
      noProject ||
      offline ||
      !ownerCan("send") ||
      state.sending ||
      state.uploading > 0;
    $("filesToggle").disabled = !state.selected;
    $("composerHint").textContent = t(
      state.archivedSelection
        ? "This conversation is archived in Codex. Your unsent draft is preserved."
        : noBackgroundCreation
          ? "Background conversations are unavailable. Update agentTools on your computer and reconnect."
          : state.settingsMutation
            ? "Saving settings…"
            : !ownerCan("send")
              ? "Viewing the original application. Your draft stays here until control reconnects."
              : state.uploading
                ? "Uploading attachments…"
                : queueUnavailable
                  ? "Update agentTools on your computer to queue messages."
                  : state.currentRequests.length
                    ? "Codex still needs your answer. New messages will be queued."
                    : queued
                      ? "Messages wait until the current task finishes. Use Steer to send one now."
                      : "Codex runs on your computer. Review its changes.",
    );
    if (!state.selected) setStatus("idle", []);
    updateConnection();
    renderPlanAction();
    renderQueue();
    renderOwner();
    renderSessionInfo();
    renderContext();
    renderReasoning();
    syncSubagents();
  }
  async function detail(generation) {
    clearTimeout(state.timer);
    const seq = ++state.detailSeq,
      id = state.selected,
      revision = state.liveRevision;
    const value = await api("sessions/" + encodeURIComponent(id));
    if (
      generation !== state.generation ||
      id !== state.selected ||
      seq !== state.detailSeq
    )
      return;
    const session = value.session,
      live = revision !== state.liveRevision ? state.live : value.live || {};
    reading.get();
    state.lastSyncedAt = Date.now();
    state.reportedOptions = value.options || null;
    state.reportedOptionsEpoch = value.live?.owner?.epoch || "";
    state.ownerUnavailable = false;
    state.session = session;
    state.cwd = session.cwd || "";
    $("cwd").textContent = session.cwd;
    if (!state.settingsMutation) {
      const options = live.options || value.options;
      if (options) {
        state.prefs = { ...options };
        state.prefsLoaded = true;
      }
    }
    if (session.cwd) {
      const owner =
        state.projects
          .filter(
            (p) =>
              session.cwd === p ||
              session.cwd.startsWith(p.replace(/[\\/]$/, "") + "/"),
          )
          .sort((a, b) => b.length - a.length)[0] || "";
      if (owner !== state.project) {
        state.project = owner;
        state.optionsLoaded = false;
      }
    }
    renderProjects();
    state.history = mergeOrdered(state.history, state.live.items || []);
    state.live = live;
    const native = value.history_items,
      history = value.history || { parts: [] };
    state.legacyParts = history.parts || [];
    state.historyCut = !!history.cut;
    state.nativeHistory = Array.isArray(native);
    state.history = mergeOrdered(state.history, native || []);
    const boundary = native?.[0]?.id || "";
    if (!state.historyPagingStarted || boundary !== state.historyBoundary) {
      state.historyCursor = value.history_next_cursor || "";
      state.historyAnchor = boundary;
      state.historyPagingStarted = true;
      state.historyBoundary = boundary;
    }
    $("older").hidden = !state.historyCursor;
    renderCurrent();
    if (value.history_error) notice(value.history_error);
    ensureStream();
    schedulePoll(generation);
  }
  function renderCurrent() {
    const live = state.live;
    if (live.options && !state.settingsMutation) {
      state.prefs = { ...live.options };
      state.prefsLoaded = true;
    }
    applyLiveQueue(live);
    state.turnID = live.turn_id || "";
    state.running = ["starting", "inProgress"].includes(live.status);
    state.currentRequests = [
      ...(live.requests || []),
      ...(getAgent().asyncQuestions?.(live) || []),
    ];
    renderOwner();
    if (state.session && typeof live.title === "string" && live.title.trim())
      state.session.title = live.title;
    const title = state.session?.title;
    $("title").textContent =
      title === "New session"
        ? t("New session")
        : title || t("Untitled session");
    const row = state.sessions.find((session) => session.id === state.selected),
      status = state.currentRequests.length
        ? "waiting"
        : state.running
          ? "running"
          : live.status;
    if (
      row &&
      state.session &&
      (row.title !== title || (status && row.status !== status))
    ) {
      row.title = title;
      if (status) row.status = status;
      renderSessions();
    }
    renderTimeline();
    renderPlan(live.plan);
    renderChanges();
    renderRequests(state.currentRequests);
    $("working").hidden =
      !state.running ||
      !!state.currentRequests.length ||
      state.live.owner?.state === "offline";
    renderView(
      $("working"),
      $("working").hidden ? null : (
        <TurnStatus
          activity={
            {
              agentMessage: "writing",
              commandExecution: "running",
              mcpToolCall: "running",
              webSearch: "searching",
              contextCompaction: "compacting",
            }[live.activity] || "thinking"
          }
          label={t(
            live.retrying
              ? "Retrying…"
              : state.live.owner?.state !== "connected" && state.live.owner
                ? "Following the original application…"
                : {
                    agentMessage: "Writing a response…",
                    commandExecution: "Running a command…",
                    mcpToolCall: "Using a tool…",
                    fileChange: "Updating files…",
                    webSearch: "Searching the web…",
                  }[live.activity] || "Codex is thinking…",
          )}
        />
      ),
    );
    setStatus(live.status, state.currentRequests);
    $("cut").hidden =
      !state.historyCut &&
      !live.cut &&
      !live.diff_cut &&
      ![...state.history, ...(live.items || [])].some((item) => item.cut);
    if (typeof live.title_notice === "string" && live.title_notice.trim())
      notice(live.title_notice);
    updateControls();
    updateLatest();
    refreshWorkspaceChanges();
    refreshPendingPlan();
    refreshQueue();
  }
  function renderSessionInfo() {
    if (!$("sessionInfoDialog").open) return;
    const owner = state.live.owner || {},
      options =
        state.live.options ||
        ((owner.epoch || "") === state.reportedOptionsEpoch
          ? state.reportedOptions
          : null) ||
        {},
      catalog = state.catalog,
      label = (value, names) =>
        value == null || value === ""
          ? t("Unknown")
          : t(names[value] || "Unknown") + (names[value] ? "" : " · " + value),
      taskNames = {
        starting: "Running",
        inProgress: "Running",
        completed: "Completed",
        failed: "Failed",
        interrupted: "Interrupted",
        idle: "Ready",
        unknown: "Status unknown",
      },
      connectionNames = {
        open: "Live updates",
        connecting: "Connecting live updates…",
        retrying: "Reconnecting live updates…",
        fallback: "Live stream unavailable; refreshing periodically.",
        closed: "Live stream closed",
      },
      ownerNames = {
        connected: "Connected",
        offline: "Unavailable",
        observing: "Observing",
        available: "Available to connect",
        unknown: "Connection unknown",
        disconnected: "Disconnected",
      },
      sourceNames = {
        background: "Background execution on your computer",
        native: "Original application",
        remote: "Remote execution on your computer",
      },
      rows = [
        ["Project", state.session?.cwd || state.cwd || t("Unknown")],
        [
          "Computer connection",
          state.deviceConnectionUnknown
            ? t("Connection unknown")
            : state.device?.online === true
              ? t("Computer online")
              : state.device?.online === false
                ? t("Computer offline")
                : t("Unknown"),
        ],
        ["Live stream", label(state.streamMode, connectionNames)],
        ["Execution source", label(owner.kind, sourceNames)],
        ["Execution owner", label(owner.state, ownerNames)],
        ["Task status", label(state.live.status, taskNames)],
        [
          "Last successful sync",
          state.lastSyncedAt
            ? new Date(state.lastSyncedAt).toLocaleString()
            : t("Unknown"),
        ],
      ],
      settingLabels = {
        model: "Model",
        effort: "Reasoning effort",
        permission: "Permissions",
        mode: "Mode",
      },
      formatSetting = (key, value) => {
        if (value == null || value === "") return t("Unknown");
        if (key === "permission")
          return t(
            getAgent().permissionLabel(value, { ...state, nativeSettings }),
          );
        if (key === "mode")
          return t(
            value === "plan" ? "Plan" : value === "default" ? "Default" : value,
          );
        if (key === "effort") return effortName(value);
        return (
          getAgent().modelName(getAgent().selectedModel?.(catalog, value)) ||
          value
        );
      },
      mcpStatusNames = {
        notStarted: "Not started",
        starting: "Running",
        connected: "Connected",
        authenticationRequired: "Authentication required",
        failed: "Failed",
        cancelled: "Cancelled",
        disabled: "Disabled",
      };
    const servers = Array.isArray(catalog.mcp_servers)
      ? catalog.mcp_servers
      : [
          ...new Set((catalog.tools || []).map((tool) => tool.server || "")),
        ].map((name) => ({ name }));
    renderView(
      $("sessionInfoContent"),
      <>
        <dl className="session-info-fields">
          {rows.map(([name, value]) => (
            <div key={name}>
              <dt>{t(name)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="note">
          {t("Sync time is observed by this browser, not task execution time.")}
        </p>
        {state.streamMode === "retrying" && (
          <p className="note">
            {t(
              "Reconnecting the page stream does not retry the model request.",
            )}
          </p>
        )}
        {owner.notice && <p className="note">{t(owner.notice)}</p>}
        <h3>{t("Owner-reported settings")}</h3>
        <p className="note">
          {t(
            owner.state === "connected" &&
              state.device?.online === true &&
              !state.ownerUnavailable
              ? "Reported by the connected execution owner."
              : "Last reported values; the execution owner is not currently confirmed.",
          )}
        </p>
        <dl className="session-info-fields">
          {Object.entries(settingLabels).map(([key, name]) => (
            <div key={key}>
              <dt>{t(name)}</dt>
              <dd>{formatSetting(key, options[key])}</dd>
            </div>
          ))}
        </dl>
        {(state.settingsMutation ||
          Object.keys(settingLabels).some(
            (key) => state.prefs[key] && state.prefs[key] !== options[key],
          )) && (
          <>
            <h3>{t("Page preferences · awaiting confirmation")}</h3>
            <dl className="session-info-fields">
              {Object.entries(settingLabels)
                .filter(
                  ([key]) =>
                    state.prefs[key] && state.prefs[key] !== options[key],
                )
                .map(([key, name]) => (
                  <div key={key}>
                    <dt>{t(name)}</dt>
                    <dd>{formatSetting(key, state.prefs[key])}</dd>
                  </div>
                ))}
            </dl>
          </>
        )}
        <h3>{t("Skills")}</h3>
        {!state.optionsLoaded ? (
          <p>{t("Catalog not loaded")}</p>
        ) : catalog.skills?.length ? (
          catalog.skills.map((skill) => (
            <div className="catalog-entry" key={skill.path || skill.name}>
              <strong>{skill.name}</strong>
              <p>{skill.description}</p>
              <small>{skill.path}</small>
            </div>
          ))
        ) : (
          <p>{t("No entries reported")}</p>
        )}
        <h3>{t("Tools")}</h3>
        {!state.optionsLoaded ? (
          <p>{t("Catalog not loaded")}</p>
        ) : !servers.length ? (
          <p>
            {t(
              Array.isArray(catalog.mcp_servers)
                ? "No MCP servers reported"
                : "MCP catalog unavailable",
            )}
          </p>
        ) : (
          servers.map((server) => {
            const tools = (catalog.tools || []).filter(
              (tool) => (tool.server || "") === server.name,
            );
            return (
              <section className="catalog-entry" key={server.name}>
                <strong>{server.name || t("Tools")}</strong>
                {server.runtime_status && (
                  <p>
                    {t("Connection")}:{" "}
                    {label(server.runtime_status, mcpStatusNames)}
                  </p>
                )}
                {server.auth_status && (
                  <p>
                    {t("Authentication")}:{" "}
                    {label(server.auth_status, {
                      unsupported: "Not supported",
                      notLoggedIn: "Not signed in",
                      bearerToken: "Token configured",
                      oAuth: "Signed in",
                    })}
                  </p>
                )}
                {Object.hasOwn(server, "tools_error") ? (
                  <p role="status">
                    {t("Unable to load tools")}: {server.tools_error}
                  </p>
                ) : tools.length ? (
                  tools.map((tool) => (
                    <div key={tool.name}>
                      <strong>
                        {[server.name, tool.name].filter(Boolean).join(" / ")}
                      </strong>
                      <p>{tool.description}</p>
                    </div>
                  ))
                ) : (
                  <p>
                    {t(
                      server.tools_known === true
                        ? "No tools reported by this server"
                        : "Tools not loaded",
                    )}
                  </p>
                )}
              </section>
            );
          })
        )}
        {catalog.errors?.length > 0 && (
          <>
            <h3>{t("Catalog errors")}</h3>
            {catalog.errors.map((error, index) => (
              <p role="status" key={index}>
                {String(error)}
              </p>
            ))}
          </>
        )}
      </>,
    );
  }
  $("sessionInfo").onclick = () => {
    if (!state.selected) return;
    $("sessionInfoDialog").showModal();
    renderSessionInfo();
  };
  $("closeSessionInfo").onclick = () => $("sessionInfoDialog").close();
  const { markdown, safeURL } = createMarkdown({
    run: (...args) => run(...args),
    openProjectFile: (...args) => openProjectFile(...args),
    t,
    Action: (...args) => Action(...args),
  });
  const {
    mergeOrdered,
    renderItems,
    legacyItems,
    displayDiff,
    DiffStats,
    textOf,
    Copy,
    Resource,
  } = createConversation({
    getAgent,
    getScope: () =>
      [state.device?.id, getAgent().id, state.selected, state.generation].join(
        "|",
      ),
    getChangedFiles: () => changedFiles(),
    getReadingState: () => reading.get(),
    onReadingChange: () => reading.persist(),
    isPartialHistory: () =>
      !!state.historyCursor || state.historyCut || !!state.live.cut,
    jumpToItem,
    openTurnChanges: (...args) => openTurnChanges(...args),
    getLive: () => state.live,
    getAllItems: conversationItems,
    turnLabel,
    getRequests: () => state.currentRequests,
    openRequest: (...args) => openRequest(...args),
    openProjectFile: (...args) => openProjectFile(...args),
    openAttachment: (...args) => openAttachment(...args),
    getSubagents: () => getSubagents(),
    openSubagent: (...args) => openSubagent(...args),
    t,
    markdown: (...args) => markdown(...args),
    Action: (...args) => Action(...args),
    openChanges: (...args) => openChanges(...args),
    projectName: (...args) => projectName(...args),
  });
  const { syncSubagents, resetSubagents, getSubagents, openSubagent } =
    createSubagents({
      jumpToItem,
      onAgentsChanged: () => renderCurrent(),
      state,
      $,
      t,
      getAgent,
      api: (...args) => api(...args),
      run: (...args) => run(...args),
      Action: (...args) => Action(...args),
      projectName: (...args) => projectName(...args),
    });
  const {
    loadProjectFiles,
    openProjectFile,
    closeFilePreview,
    openAttachment,
  } = createFiles({
    getAgent,
    state,
    $,
    t,
    api: (...args) => api(...args),
    Action: (...args) => Action(...args),
    openPanel: (...args) => openPanel(...args),
    run: (...args) => run(...args),
    projectName: (...args) => projectName(...args),
  });
  const {
    renderQueue,
    refreshQueue,
    shouldQueue,
    applyLiveQueue,
    resetQueue,
    applyQueue,
    saveQueueEdit,
    updateQueueEdit,
    cancelQueueEdit,
    mutateQueue,
  } = createQueue({
    state,
    ownerEpoch: (...args) => ownerEpoch(...args),
    $,
    api: (...args) => api(...args),
    updateControls: (...args) => updateControls(...args),
    t,
    projectName: (...args) => projectName(...args),
    ownerCan: (...args) => ownerCan(...args),
    getLanguage: () => lang,
    Action: (...args) => Action(...args),
    requireOwner: (...args) => requireOwner(...args),
    detail: (...args) => detail(...args),
  });
  const { closeDialog, renderRequests, dismissRequest, openRequest } =
    createApprovals({
      getAgent,
      $,
      state,
      ownerCan: (...args) => ownerCan(...args),
      ownerEpoch: (...args) => ownerEpoch(...args),
      t,
      requireOwner: (...args) => requireOwner(...args),
      api: (...args) => api(...args),
      detail: (...args) => detail(...args),
      run: (...args) => run(...args),
      safeURL: (...args) => safeURL(...args),
      Action: (...args) => Action(...args),
      textOf: (...args) => textOf(...args),
    });
  const {
    closeReasoning,
    renderReasoning,
    openReasoning,
    permissionMenu,
    modeMenu,
    modelMenu,
    reasoningEfforts,
    reasoningModel,
    commitReasoning,
    reasoningDefault,
    positionReasoning,
  } = createSettings({
    getAgent,
    $,
    canConfigure: (...args) => canConfigure(...args),
    state,
    applyPreferences: (...args) => applyPreferences(...args),
    showMenu: (...args) => showMenu(...args),
    selectedModel: (...args) => selectedModel(...args),
    closeMenu: (...args) => closeMenu(...args),
    ownerEpoch: (...args) => ownerEpoch(...args),
    ownerCan: (...args) => ownerCan(...args),
    effortName,
    t,
    run: (...args) => run(...args),
  });
  const { renderAttachments, upload } = createAttachments({
    getAgent,
    requireOwner: (...args) => requireOwner(...args),
    state,
    notice,
    updateControls: (...args) => updateControls(...args),
    api: (...args) => api(...args),
    projectName: (...args) => projectName(...args),
    $,
    t,
    run: (...args) => run(...args),
  });
  const { hideSuggestions, suggest, drawSuggestions, pickSuggestion } =
    createSuggestions({
      state,
      $,
      ownerCan: (...args) => ownerCan(...args),
      t,
      applyPreferences: (...args) => applyPreferences(...args),
      openReasoning: (...args) => openReasoning(...args),
      permissionMenu: (...args) => permissionMenu(...args),
      api: (...args) => api(...args),
      projectName: (...args) => projectName(...args),
      notice,
      Action: (...args) => Action(...args),
      canConfigure: (...args) => canConfigure(...args),
      renderAttachments: (...args) => renderAttachments(...args),
      resizeComposer: (...args) => resizeComposer(...args),
      run: (...args) => run(...args),
    });
  const { ensureStream, closeStream, schedulePoll, poll } = createStream({
    getAgent,
    state,
    updateConnection: (...args) => updateConnection(...args),
    $,
    archiveConversation: (...args) => archiveConversation(...args),
    unavailableConversation: (...args) => unavailableConversation(...args),
    mergeOrdered: (...args) => mergeOrdered(...args),
    renderCurrent: (...args) => renderCurrent(...args),
    checkDevice: (...args) => checkDevice(...args),
    detail: (...args) => detail(...args),
    notice,
  });
  const {
    resetSideData,
    changedFiles,
    openTurnChanges,
    closeChanges,
    renderChanges,
    renderPlanAction,
    refreshWorkspaceChanges,
    refreshPendingPlan,
    openChanges,
    openPanel,
    setPanelTab,
    requestPlanExecution,
    executePendingPlan,
    requestPlanRevision,
    revisePendingPlan,
  } = createWorkspace({
    getReadingState: () => reading.get(),
    onReadingChange: () => reading.persist(),
    turnLabel,
    onChangesChanged: renderTimeline,
    getArtifacts: () =>
      loadedItems(state).flatMap((item) =>
        itemResources(
          item.turn_id
            ? item
            : {
                ...item,
                turn_id: (state.live.items || []).some(
                  (live) => live.id === item.id,
                )
                  ? state.live.turn_id
                  : "",
              },
        ),
      ),
    Resource,
    Copy,
    jumpToItem,
    state,
    $,
    t,
    displayDiff: (...args) => displayDiff(...args),
    DiffStats: (...args) => DiffStats(...args),
    run: (...args) => run(...args),
    openProjectFile: (...args) => openProjectFile(...args),
    closeFilePreview: (...args) => closeFilePreview(...args),
    loadProjectFiles: (...args) => loadProjectFiles(...args),
    resetQueue: (...args) => resetQueue(...args),
    resetSubagents: (...args) => resetSubagents(...args),
    api: (...args) => api(...args),
    notice,
    ownerCan: (...args) => ownerCan(...args),
    ownerEpoch: (...args) => ownerEpoch(...args),
    requireOwner: (...args) => requireOwner(...args),
    nativeSettings: (...args) => nativeSettings(...args),
    updateControls: (...args) => updateControls(...args),
    detail: (...args) => detail(...args),
    ensureStream: (...args) => ensureStream(...args),
    permissionLabel: (...args) => permissionLabel(...args),
  });
  const { showMenu, closeMenu, renderPlan } = createMenus({
    $,
    t,
    ownerEpoch: (...args) => ownerEpoch(...args),
    Action: (...args) => Action(...args),
    canConfigure: (...args) => canConfigure(...args),
  });
  const { api, cancelAPI } = createAPI({
    getAgent,
    state,
    actionCapability: (...args) => actionCapability(...args),
    requireOwner: (...args) => requireOwner(...args),
    showPair: (...args) => showPair(...args),
    setDeviceOnline: (...args) => setDeviceOnline(...args),
    archiveConversation: (...args) => archiveConversation(...args),
    unavailableConversation: (...args) => unavailableConversation(...args),
  });
  const {
    renderSessions,
    renderProjects,
    projectName,
    resetSelection,
    loadOptions,
    clearDraft,
    setNavigation,
    showWorkspace,
    list,
    createThread,
    applyPreferences,
    create,
    discardDraft,
  } = createSessions({
    saveReading: () => reading.save(),
    restoreSession: () => reading.lastSession(),
    getAgent,
    $,
    t,
    state,
    api,
    archiveConversation: (...args) => archiveConversation(...args),
    unavailableConversation: (...args) => unavailableConversation(...args),
    updateControls: (...args) => updateControls(...args),
    notice,
    Action: (...args) => Action(...args),
    run: (...args) => run(...args),
    sourceLabel: (...args) => sourceLabel(...args),
    getLanguage: () => lang,
    renderRequests,
    ensureStream,
    refreshQueue,
    closeStream,
    resetSideData,
    closeDialog,
    renderChanges,
    connectOriginalOwner: (...args) => connectOriginalOwner(...args),
    detail: (...args) => detail(...args),
    loadProjectFiles,
    requireOwner: (...args) => requireOwner(...args),
    ownerEpoch: (...args) => ownerEpoch(...args),
    chooseComposeProject: (...args) => chooseComposeProject(...args),
    renderAttachments,
    hideSuggestions,
    resizeComposer: (...args) => resizeComposer(...args),
  });
  const {
    sourceLabel,
    connectOriginalOwner,
    requireOwner,
    ownerEpoch,
    chooseComposeProject,
    ownerCan,
    nativeSettings,
    renderOwner,
    canConfigure,
    actionCapability,
  } = createOwners({
    getAgent,
    t,
    state,
    showMenu,
    $,
    projectName: (...args) => projectName(...args),
    resetSelection: (...args) => resetSelection(...args),
    renderProjects: (...args) => renderProjects(...args),
    loadOptions: (...args) => loadOptions(...args),
    updateControls: (...args) => updateControls(...args),
    closeMenu,
    closeReasoning,
    updateConnection: (...args) => updateConnection(...args),
    api,
    detail: (...args) => detail(...args),
    ensureStream,
    renderCurrent,
    mergeOrdered,
  });
  const { archiveConversation, unavailableConversation, renderContext } =
    createLifecycle({
      state,
      renderSessions: (...args) => renderSessions(...args),
      closeStream,
      resetSideData,
      closeDialog,
      closeMenu,
      closeChanges,
      hideSuggestions,
      $,
      t,
      updateControls: (...args) => updateControls(...args),
      renderCurrent: (...args) => renderCurrent(...args),
      getLanguage: () => lang,
    });
  const { renderDevice, updateConnection, checkDevice, setDeviceOnline } =
    createDevices({
      switchAgent: (...args) => switchAgent(...args),
      translate,
      state,
      nativeSettings: (...args) => nativeSettings(...args),
      $,
      t,
      closeStream,
      updateControls: (...args) => updateControls(...args),
      showPair: (...args) => showPair(...args),
      api,
      showWorkspace: (...args) => showWorkspace(...args),
      notice,
      list: (...args) => list(...args),
      detail: (...args) => detail(...args),
    });
  const { resizeComposer, updateLatest, submit } = createComposer({
    $,
    state,
    nativeSettings: (...args) => nativeSettings(...args),
    shouldQueue,
    requireOwner: (...args) => requireOwner(...args),
    ownerEpoch: (...args) => ownerEpoch(...args),
    updateControls: (...args) => updateControls(...args),
    createThread: (...args) => createThread(...args),
    resetQueue,
    detail: (...args) => detail(...args),
    ensureStream,
    api,
    applyQueue,
    clearDraft: (...args) => clearDraft(...args),
    refreshQueue,
    list: (...args) => list(...args),
  });
  const { switchAgent } = createAgentLifecycle({
    saveReading: () => reading.save(),
    state,
    $,
    getAgent,
    closeStream,
    cancelAPI,
    resetSideData,
    closeDialog,
    closeMenu,
    closeReasoning,
    clearDraft,
    renderAttachments,
    resizeComposer,
    renderSessions,
    renderProjects,
    renderChanges,
    updateControls,
    t,
  });
  $("conversationSearch").oninput = renderSearch;
  $("conversationFilter").onchange = renderSearch;
  $("conversationTurn").onchange = renderSearch;
  bindWorkspace({
    openRequest,
    $,
    closeMenu,
    chooseComposeProject,
    setNavigation,
    run: (...args) => run(...args),
    state,
    list,
    detail: (...args) => detail(...args),
    refreshWorkspaceChanges,
    refreshPendingPlan,
    refreshQueue,
    api,
    mergeOrdered,
    renderSessions,
    create,
    showMenu,
    openReasoning,
    modeMenu,
    modelMenu,
    closeReasoning,
    canConfigure,
    reasoningEfforts,
    getAgent,
    reasoningModel,
    renderReasoning,
    commitReasoning,
    reasoningDefault,
    applyPreferences,
    renderContext,
    permissionMenu,
    ownerCan,
    ownerEpoch,
    updateControls: (...args) => updateControls(...args),
    submit,
    resizeComposer,
    suggest,
    saveQueueEdit,
    updateQueueEdit,
    cancelQueueEdit,
    renderQueue,
    drawSuggestions,
    pickSuggestion,
    hideSuggestions,
    upload,
    connectOriginalOwner,
    updateLatest,
    mutateQueue,
    openChanges,
    closeChanges,
    setPanelTab,
    openPanel,
    loadProjectFiles,
    closeFilePreview,
    requestPlanExecution,
    executePendingPlan,
    requestPlanRevision,
    revisePendingPlan,
    dismissRequest,
    checkDevice,
    discardDraft,
    clearDraft,
    showPair: (...args) => showPair(...args),
    renderDevice,
    supportedLanguages,
    getLanguage: () => lang,
    setLanguage: (value) => {
      lang = value;
    },
    translate: (...args) => translate(...args),
    ensureStream,
    poll,
    closeStream,
    positionReasoning,
    renderChanges,
  });
  const key = new URLSearchParams(location.hash.slice(1)).get("key");
  if (location.hash)
    history.replaceState(null, "", location.pathname + location.search);
  run(async () => {
    if (key) await window.RemoteSecure.pair(key);
    await checkDevice();
  });
}
