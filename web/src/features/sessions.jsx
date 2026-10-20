import { renderView, clearView } from "../render";
import { RemoteIcon as Icon } from "../components/RemoteIcon";
import { PanelRow } from "../components/ui/panel";

export function createSessions({
  $,
  t,
  state,
  api,
  archiveConversation,
  unavailableConversation,
  updateControls,
  notice,
  Action,
  run,
  sourceLabel,
  getLanguage,
  renderRequests,
  ensureStream,
  refreshQueue,
  closeStream,
  resetSideData,
  closeDialog,
  renderChanges,
  connectOriginalOwner,
  detail,
  loadProjectFiles,
  requireOwner,
  ownerEpoch,
  chooseComposeProject,
  renderAttachments,
  hideSuggestions,
  resizeComposer,
  getAgent,
}) {
  function setNavigation(open) {
    document.body.classList.toggle("nav-open", open);
    $("navBackdrop").hidden = !open;
    $("sidebarToggle").setAttribute("aria-expanded", String(open));
  }
  function projectName(path) {
    return (
      state.sidebarProjects?.find((project) =>
        project.root_paths?.includes(path),
      )?.name ||
      path?.split(/[\\/]/).filter(Boolean).pop() ||
      t("All projects")
    );
  }
  function showWorkspace() {
    $("pair").hidden = true;
    $("workspace").hidden = false;
    $("logout").hidden = false;
  }
  async function list(append = false) {
    const seq = ++state.listSeq,
      project = state.listProject;
    const value = await api(
      "sessions?" +
        new URLSearchParams({
          project,
          offset: String(append ? state.next : 0),
        }),
    );
    if (seq !== state.listSeq || project !== state.listProject) return;
    state.projects = value.projects || [];
    state.sidebarProjects = value.sidebar_projects || null;
    state.pinnedIDs = value.pinned_ids || [];
    state.sessions = append
      ? [...state.sessions, ...value.sessions]
      : value.sessions;
    const archived = new Set(value.archived_ids || []);
    state.sessions = state.sessions.filter(
      (session) => !archived.has(session.id),
    );
    if (archived.has(state.selected)) archiveConversation(state.selected);
    if (value.history_unavailable && state.selected)
      unavailableConversation(value.history_warning);
    state.next = value.next;
    $("more").hidden = !value.has_more;
    if (!state.project && state.projects.length === 1)
      state.project = state.projects[0];
    showWorkspace();
    renderProjects();
    renderSessions();
    updateControls();
    if (!state.optionsLoaded) await loadOptions();
    if (value.history_warning) notice(value.history_warning);
  }
  function renderProjects() {
    const current = state.listProject;
    renderView(
      $("project"),
      <>
        <Icon name="folder" />
        <span className="label">{projectName(current)}</span>
        <Icon name="chevron" />
      </>,
    );
    $("breadcrumbProject").textContent =
      state.cwd || state.project
        ? projectName(state.cwd || state.project)
        : t("Choose a project");
    renderView(
      $("projects"),
      ["", ...state.projects].map((path) => (
        <Action
          key={path}
          role="menuitemradio"
          aria-checked={path === current}
          action={async () => {
            if (state.sending) return;
            state.listProject = path;
            if (!state.selected && path) state.project = path;
            state.optionsLoaded = false;
            $("projects").hidden = true;
            $("project").setAttribute("aria-expanded", "false");
            await list();
          }}
        >
          <Icon name={path ? "folder" : "globe"} />
          <span>{path || t("All projects")}</span>
        </Action>
      )),
    );
  }
  function renderSessions() {
    const query = $("search").value.toLowerCase().trim();
    const running = (status) =>
      ["running", "waiting", "inProgress", "starting"].includes(status);
    const rows = state.sessions
      .filter(
        (s) => !query || (s.title + " " + s.cwd).toLowerCase().includes(query),
      )
      .sort((a, b) => Number(running(b.status)) - Number(running(a.status)));
    const expanded = new Map(
      [...$("sessions").querySelectorAll(".project-group")].map((group) => [
        group.dataset.path,
        group.open,
      ]),
    );
    const groups = new Map();
    if (state.sidebarProjects && state.projects.length) {
      const pinned = new Set(state.pinnedIDs);
      groups.set("pinned", { name: t("Pinned"), icon: "pin", sessions: [] });
      for (const project of state.sidebarProjects.filter(
        (project) =>
          !state.listProject || project.root_paths?.includes(state.listProject),
      ))
        groups.set("project:" + project.id, {
          name: project.name,
          path: project.root_paths?.join("\n"),
          icon: "folder",
          project,
          sessions: [],
        });
      groups.set("recent", { name: t("Recent"), icon: "clock", sessions: [] });
      for (const session of rows) {
        const key =
          session.pinned || pinned.has(session.id)
            ? "pinned"
            : "project:" + session.project_id;
        (groups.get(key) || groups.get("recent")).sessions.push(session);
      }
    } else {
      for (const session of rows) {
        const owner =
          state.projects
            .filter(
              (path) =>
                session.cwd === path ||
                session.cwd.startsWith(path.replace(/[\\/]$/, "") + "/"),
            )
            .sort((a, b) => b.length - a.length)[0] ||
          session.cwd ||
          "";
        if (!groups.has(owner))
          groups.set(owner, {
            name: projectName(owner),
            path: owner,
            icon: "folder",
            sessions: [],
          });
        groups.get(owner).sessions.push(session);
      }
    }
    renderView(
      $("sessions"),
      <>
        {[...groups]
          .filter(
            ([, group]) => group.sessions.length || (!query && group.project),
          )
          .map(([owner, group]) => (
            <details
              key={owner}
              className="project-group"
              data-path={owner}
              open={query ? true : expanded.get(owner) !== false}
            >
              <summary title={group.path || group.name}>
                <Icon name={group.icon} />
                <span>{group.name}</span>
                <Icon name="chevron" className="fold-icon" />
              </summary>
              {group.project && group.sessions.length === 0 && (
                <Action
                  action={async () => {
                    if (state.sending) return;
                    if (!(await resetSelection())) return;
                    state.project = group.project.root_paths[0];
                    state.optionsLoaded = false;
                    renderProjects();
                    renderSessions();
                    setNavigation(false);
                    await loadOptions();
                    $("message").focus();
                  }}
                >
                  <Icon name="plus" />
                  {t("New session")}
                </Action>
              )}
              {group.sessions.map((session) => {
                const date = new Date(session.last);
                return (
                  <PanelRow
                    key={session.id}
                    chosen={session.id === state.selected}
                    data-id={session.id}
                    aria-current={String(session.id === state.selected)}
                    title={session.title || t("Untitled session")}
                    onClick={(event) =>
                      run(() => select(session.id), event.currentTarget)
                    }
                  >
                    <Icon name="file" />
                    <span className="session-title">
                      {session.title === "New session"
                        ? t("New session")
                        : session.title || t("Untitled session")}
                    </span>
                    {session.source && (
                      <span className="session-source">
                        {sourceLabel(session.source)}
                      </span>
                    )}
                    {running(session.status) && (
                      <i
                        className="session-running"
                        title={t(
                          session.status === "waiting"
                            ? "Waiting for you"
                            : "Running",
                        )}
                      />
                    )}
                    {!Number.isNaN(date.valueOf()) && (
                      <small>
                        {date.toLocaleDateString(
                          getLanguage() === "zh" ? "zh-CN" : getLanguage(),
                          {
                            month: "short",
                            day: "numeric",
                          },
                        )}
                      </small>
                    )}
                  </PanelRow>
                );
              })}
            </details>
          ))}
        {!rows.length && (
          <p className="note">
            {t(query ? "No matching conversations." : "No sessions yet.")}
          </p>
        )}
      </>,
    );
    $("sessionCount").textContent = String(state.sessions.length);
  }

  async function loadOptions(required = false) {
    const seq = ++state.optionsSeq,
      query = new URLSearchParams();
    if (!state.selected && !state.project) {
      state.optionsLoaded = false;
      updateControls();
      return;
    }
    if (state.project) query.set("project", state.project);
    if (state.selected) query.set("thread", state.selected);
    state.optionsLoaded = false;
    updateControls();
    try {
      const result = await api("options?" + query);
      if (seq !== state.optionsSeq) return;
      if (result.agent && result.agent.id !== getAgent().id)
        throw new Error("The active agent changed. Refresh before continuing.");
      state.catalog = { ...result, agent: getAgent() };
      state.optionsLoaded = true;
      updateControls();
      renderRequests(state.currentRequests);
      ensureStream();
      refreshQueue();
      $("capabilityIssue").hidden = !result.errors?.length;
      return result;
    } catch (e) {
      if (seq !== state.optionsSeq) return;
      state.optionsLoaded = false;
      if (!state.stream) state.catalog.capabilities = {};
      if (e.message !== "Unknown API") notice(e.message);
      updateControls();
      if (required) throw e;
    }
  }
  async function resetSelection() {
    state.connectingOwner?.controller?.abort();
    closeStream();
    const navigation = ++state.generation;
    state.optionsSeq++;
    state.selecting = navigation;
    try {
      await discardDraft(navigation);
    } finally {
      if (state.selecting === navigation) state.selecting = false;
    }
    if (navigation !== state.generation) return false;
    state.selected = "";
    state.archivedSelection = "";
    state.ownerUnavailable = false;
    state.session = null;
    state.optionsSeq++;
    clearTimeout(state.timer);
    state.currentRequests = [];
    state.running = false;
    state.history = [];
    state.historyCursor = "";
    state.historyAnchor = "";
    state.historyPagingStarted = false;
    state.historyBoundary = "";
    state.prefsLoaded = false;
    state.legacyParts = [];
    state.historyCut = false;
    state.nativeHistory = false;
    state.live = {};
    state.prefs = {};
    state.settingsMutation = null;
    resetSideData();
    state.requestKey = "";
    state.dismissedKey = "";
    clearView($("history"));
    clearView($("live"));
    $("planProgress").hidden = true;
    $("working").hidden = true;
    $("cwd").textContent = "";
    $("title").textContent = t("New session");
    $("older").hidden = true;
    closeDialog();
    renderChanges();
    updateControls();
    return true;
  }
  async function discardDraft(generation = state.generation) {
    const drafts = [...state.attachments];
    for (const draft of drafts) {
      try {
        await api("attachments/" + encodeURIComponent(draft.id), undefined, {
          method: "DELETE",
        });
      } catch (e) {
        notice(e.message);
      }
    }
    if (generation === state.generation) clearDraft();
  }
  async function select(id) {
    if (state.sending) return;
    if (id === state.selected && !state.selecting) {
      setNavigation(false);
      return connectOriginalOwner();
    }
    state.connectingOwner?.controller?.abort();
    closeStream();
    const navigation = ++state.generation;
    state.optionsSeq++;
    state.selecting = navigation;
    try {
      await discardDraft(navigation);
    } finally {
      if (state.selecting === navigation) state.selecting = false;
    }
    if (navigation !== state.generation) return;
    state.selected = id;
    state.archivedSelection = "";
    state.ownerUnavailable = false;
    state.session = state.sessions.find((session) => session.id === id) || null;
    state.generation++;
    state.detailSeq++;
    clearTimeout(state.timer);
    state.requestKey = "";
    state.dismissedKey = "";
    state.history = [];
    state.historyCursor = "";
    state.historyAnchor = "";
    state.historyPagingStarted = false;
    state.historyBoundary = "";
    state.prefsLoaded = false;
    state.legacyParts = [];
    state.historyCut = false;
    state.nativeHistory = false;
    state.live = {};
    resetSideData();
    state.prefs = {};
    state.settingsMutation = null;
    state.running = false;
    state.turnID = "";
    clearView($("history"));
    clearView($("live"));
    clearView($("planProgress"));
    $("working").hidden = true;
    $("welcome").hidden = true;
    closeDialog();
    clearDraft();
    renderSessions();
    setNavigation(false);
    updateControls();
    const generation = state.generation,
      current = () => id === state.selected && generation === state.generation;
    if (state.session?.cwd)
      state.project =
        state.projects
          .filter(
            (path) =>
              state.session.cwd === path ||
              state.session.cwd.startsWith(path.replace(/[\\/]$/, "") + "/"),
          )
          .sort((a, b) => b.length - a.length)[0] || "";
    await Promise.all([
      loadOptions(),
      (async () => {
        await detail(generation);
        if (current()) await connectOriginalOwner();
      })(),
    ]);
    if (current() && !$("changesPanel").hidden && state.sideTab === "files")
      await loadProjectFiles();
  }
  function applyPreferences(changes) {
    if (!state.selected) {
      state.prefs = { ...state.prefs, ...changes };
      updateControls();
      return;
    }
    return savePreferences(changes);
  }
  async function savePreferences(changes) {
    requireOwner("configure");
    if (state.settingsMutation || state.running || state.sending) return;
    const mutation = {
      id: state.selected,
      generation: state.generation,
      epoch: ownerEpoch(),
      previous: { ...state.prefs },
    };
    const current = () =>
      mutation.id === state.selected &&
      mutation.generation === state.generation &&
      mutation.epoch === ownerEpoch();
    state.settingsMutation = mutation;
    updateControls();
    try {
      const response = await api(
        "threads/" + encodeURIComponent(mutation.id) + "/settings",
        changes,
      );
      if (!current()) return;
      if (
        !response?.options ||
        typeof response.options !== "object" ||
        Array.isArray(response.options)
      )
        throw new Error("Unable to save conversation settings.");
      state.settingsMutation = null;
      state.prefs = { ...response.options };
      state.live.options = { ...response.options };
      state.prefsLoaded = true;
      updateControls();
      await detail(mutation.generation);
    } catch (error) {
      if (current()) {
        state.prefs = { ...(state.live.options || mutation.previous) };
        notice(error.message);
      }
      throw error;
    } finally {
      if (state.settingsMutation === mutation) state.settingsMutation = null;
      if (
        mutation.id === state.selected &&
        mutation.generation === state.generation
      ) {
        if (state.live.options) state.prefs = { ...state.live.options };
        updateControls();
      }
    }
  }
  async function createThread() {
    const generation = state.generation,
      project = state.project,
      selected = state.selected,
      options = {
        project,
        ...(!selected ? state.prefs : {}),
        executor: "background",
      };
    try {
      const catalog = await loadOptions(true);
      if (
        !catalog ||
        generation !== state.generation ||
        project !== state.project ||
        selected !== state.selected
      )
        throw new Error("Connection failed.");
      if (catalog?.capabilities?.background_creation !== true)
        throw new Error(
          "Background conversations are unavailable. Update agentTools on your computer and reconnect.",
        );
      return await api("threads", options);
    } catch (error) {
      if (generation === state.generation && error.createdThreadID)
        await recoverCreatedThread(error.createdThreadID);
      throw error;
    }
  }
  async function recoverCreatedThread(id) {
    closeStream();
    clearTimeout(state.timer);
    state.selected = id;
    state.generation++;
    const generation = state.generation;
    state.liveRevision = 0;
    state.detailSeq++;
    state.optionsSeq++;
    state.session = {
      id,
      source: getAgent().sourceID,
      title: "New session",
      cwd: state.project,
    };
    state.live = {
      status: "unknown",
      items: [],
      requests: [],
      owner: { kind: "native", state: "observing", capabilities: {} },
    };
    state.prefs = {};
    state.prefsLoaded = false;
    state.optionsLoaded = false;
    state.settingsMutation = null;
    state.history = [];
    state.historyCursor = "";
    state.historyAnchor = "";
    state.historyPagingStarted = false;
    state.historyBoundary = "";
    state.legacyParts = [];
    state.historyCut = false;
    state.nativeHistory = false;
    state.running = false;
    state.turnID = "";
    state.currentRequests = [];
    state.requestKey = "";
    state.dismissedKey = "";
    resetSideData();
    closeDialog();
    clearView($("history"));
    clearView($("live"));
    $("welcome").hidden = true;
    updateControls();
    try {
      await detail(generation);
      if (generation === state.generation) await loadOptions();
    } catch {
      /* The created ID stays selected for an explicit reconnect or retry. */
    } finally {
      if (generation === state.generation) {
        state.sending = false;
        updateControls();
      }
    }
  }
  async function create() {
    if (state.sending) return;
    if (!state.project) {
      chooseComposeProject();
      return;
    }
    state.sending = true;
    updateControls();
    let value;
    try {
      value = await createThread();
    } finally {
      state.sending = false;
      updateControls();
    }
    await select(value.id);
    await list();
    updateControls();
  }
  function clearDraft() {
    state.queueDraftID = "";
    state.queueDraftKey = "";
    $("message").value = "";
    state.attachments = [];
    state.skills = [];
    state.mentions = [];
    state.tools = [];
    renderAttachments();
    hideSuggestions();
    resizeComposer();
  }

  return {
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
  };
}
