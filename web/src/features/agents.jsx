import { renderView, clearView } from "../render";

export function createAgentLifecycle({
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
  saveReading = () => {},
  clearCreatedThreads = () => {},
  translate,
  list,
}) {
  const drafts = new Map();
  const scope = (agent) => JSON.stringify([state.device?.id, agent]);
  const connected = (agent) => !agent?.state || agent.state === "connected";
  const statusLabel = (agent) =>
    ({
      connecting: "Connecting…",
      connected: "Connected",
      disconnected: "Disconnected",
      unavailable: "Unavailable",
    })[agent?.state];
  function renderAgents() {
    const select = $("agentSelect");
    renderView(
      select,
      (state.agents || []).map((agent) => (
        <option key={agent.id} value={agent.id}>
          {agent.name}
          {agent.state ? " · " + t(statusLabel(agent)) : ""}
        </option>
      )),
    );
    select.value = getAgent().id;
    select.disabled =
      !state.agentDiscovered || state.sending || state.uploading > 0;
    const agent = state.agents?.find((value) => value.id === getAgent().id),
      status = $("agentConnectionStatus");
    status.hidden = !agent?.state;
    status.dataset.state = agent?.state || "";
    status.textContent = agent?.state
      ? [t(statusLabel(agent)), agent.problem].filter(Boolean).join(" · ")
      : "";
  }
  function setAgents(result) {
    const agents = result?.agents;
    if (
      !Array.isArray(agents) ||
      !agents.length ||
      agents.length > 64 ||
      agents.some(
        (agent) =>
          !agent ||
          typeof agent.id !== "string" ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(agent.id) ||
          typeof agent.name !== "string" ||
          !agent.name.trim() ||
          agent.name.length > 256 ||
          (agent.state !== undefined &&
            ![
              "connecting",
              "connected",
              "disconnected",
              "unavailable",
            ].includes(agent.state)) ||
          (agent.problem !== undefined &&
            (typeof agent.problem !== "string" || agent.problem.length > 4096)),
      ) ||
      new Set(agents.map((agent) => agent.id)).size !== agents.length ||
      !agents.some((agent) => agent.id === result.default_agent)
    )
      throw new Error("The connected agent could not be verified.");
    const current = state.catalog.agent?.id,
      previous = state.agents?.find((agent) => agent.id === current);
    let preferred;
    try {
      preferred = sessionStorage.getItem("remote.agent.v1:" + state.device.id);
    } catch {}
    const selected =
      agents.find((agent) => agent.id === current) ||
      agents.find((agent) => agent.id === preferred && connected(agent)) ||
      agents.find(
        (agent) => agent.id === result.default_agent && connected(agent),
      ) ||
      agents.find(connected) ||
      agents.find((agent) => agent.id === preferred) ||
      agents.find((agent) => agent.id === result.default_agent);
    state.agents = agents;
    switchAgent(selected);
    state.agentDiscovered = true;
    const changed = current !== selected.id,
      recovered =
        !changed && previous && !connected(previous) && connected(selected);
    if (!changed && previous && connected(previous) && !connected(selected)) {
      closeStream();
      cancelAPI();
      clearTimeout(state.timer);
      state.generation++;
      state.listSeq++;
      state.detailSeq++;
      state.optionsSeq++;
      state.optionsLoaded = false;
      state.settingsMutation = null;
      state.sending = false;
      state.selecting = false;
      state.agentReadPending = !!state.selected;
    }
    renderAgents();
    updateControls();
    return { changed, recovered, connected: connected(selected) };
  }
  async function chooseAgent(id) {
    if (!state.agentDiscovered || state.sending || state.uploading) return;
    const agent = state.agents.find((candidate) => candidate.id === id);
    if (!agent || agent.id === getAgent().id) return;
    switchAgent(agent);
    translate();
    if (connected(agent)) await list();
  }

  function switchAgent(agent) {
    const previous = getAgent().id;
    if (!state.catalog.agent || previous === agent.id) {
      state.catalog.agent = agent;
      return;
    }
    saveReading();
    clearCreatedThreads();
    state.reportedOptions = null;
    drafts.set(scope(previous), {
      prefs: !state.selected ? { ...state.prefs } : {},
      project: state.projectless ? "" : state.project,
      projectless: state.projectless,
      text: $("message").value,
      attachments: state.attachments,
      skills: state.skills,
      mentions: state.mentions,
      tools: state.tools,
      queueDraftID: state.queueDraftID,
      queueDraftKey: state.queueDraftKey,
    });
    closeStream();
    cancelAPI();
    clearTimeout(state.timer);
    state.generation++;
    state.listSeq++;
    state.detailSeq++;
    state.optionsSeq++;
    state.selected = "";
    state.session = null;
    state.project = "";
    state.projectless = false;
    state.sessions = [];
    state.projects = [];
    state.creationProjects = [];
    state.sidebarProjects = null;
    state.pinnedIDs = [];
    state.archivedSelection = "";
    state.ownerUnavailable = false;
    state.live = {};
    state.history = [];
    state.legacyParts = [];
    state.historyCursor = "";
    state.historyAnchor = "";
    state.historyBoundary = "";
    state.historyPagingStarted = false;
    state.historyCut = false;
    state.nativeHistory = false;
    state.prefs = {};
    state.prefsLoaded = false;
    state.optionsLoaded = false;
    state.settingsMutation = null;
    state.agentReadPending = false;
    state.liveRevision = 0;
    state.selecting = false;
    state.next = 0;
    state.running = false;
    state.sending = false;
    state.turnID = "";
    state.requestKey = "";
    state.dismissedKey = "";
    state.currentRequests = [];
    resetSideData();
    closeDialog();
    closeMenu();
    closeReasoning(false);
    for (const id of ["history", "live", "planProgress"]) clearView($(id));
    $("cwd").textContent = "";
    $("title").textContent = t("New session");
    $("older").hidden = true;
    $("working").hidden = true;
    $("planProgress").hidden = true;
    state.catalog = { agent, capabilities: {} };
    clearDraft();
    const draft = drafts.get(scope(agent.id));
    if (draft) {
      const { text, ...values } = draft;
      Object.assign(state, values);
      $("message").value = text;
      renderAttachments();
      resizeComposer();
    }
    try {
      sessionStorage.setItem("remote.agent.v1:" + state.device.id, agent.id);
    } catch {}
    renderAgents();
    renderSessions();
    renderProjects();
    renderChanges();
    updateControls();
  }

  return { switchAgent, setAgents, chooseAgent, renderAgents };
}
