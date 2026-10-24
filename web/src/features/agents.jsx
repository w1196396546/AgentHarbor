import { clearView } from "../render";

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
}) {
  const drafts = new Map();

  function switchAgent(agent) {
    const previous = getAgent().id;
    if (!state.catalog.agent || previous === agent.id) {
      state.catalog.agent = agent;
      return;
    }
    saveReading();
    clearCreatedThreads();
    state.reportedOptions = null;
    drafts.set(previous, {
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
    state.listProject = "";
    state.sessions = [];
    state.projects = [];
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
    const draft = drafts.get(agent.id);
    if (draft) {
      const { text, ...values } = draft;
      Object.assign(state, values);
      $("message").value = text;
      renderAttachments();
      resizeComposer();
    }
    renderSessions();
    renderProjects();
    renderChanges();
    updateControls();
  }

  return { switchAgent };
}
