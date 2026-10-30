import { renderView, clearView } from "../render";
import { createCreationRequests } from "./creation-requests";
import { RemoteIcon as Icon } from "../components/RemoteIcon";
import { PanelRow } from "../components/ui/panel";
import { Button } from "../components/ui/button";
import {
  owningProject,
  sameProjectPath,
  sessionProject,
  selectableProjects,
} from "../project-paths";

export function createSessions({
  $,
  t,
  state,
  api,
  archiveConversation,
  unavailableConversation,
  updateControls,
  notice,
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
  connectionMetadata,
  loadProjectFiles,
  requireOwner,
  ownerEpoch,
  chooseComposeProject,
  renderAttachments,
  hideSuggestions,
  resizeComposer,
  getAgent,
  saveReading = () => {},
  restoreSession = () => "",
}) {
  let listRequests = 0,
    restoredScope = "",
    createdScope = "";
  let projectScope = "", projectLimits = {}, projectPages = {};
  const createdSessions = new Map();
  let inventoryRequest = null;
  let creationRequests;
  const creationWrites = new Map();
  function clearCreatedThreads() {
    createdSessions.clear();
    createdScope = "";
  }
  function pendingCreatedSessions() {
    const scope = JSON.stringify([state.device?.id, getAgent().id]);
    if (scope !== createdScope) {
      createdScope = scope;
      createdSessions.clear();
    }
    return createdSessions;
  }
  function forgetCreatedThread(id) {
    pendingCreatedSessions().delete(id);
  }
  function rememberCreatedThread(value, project) {
    const row = {
      title: "New session",
      cwd: project,
      last: new Date().toISOString(),
      ...value,
    };
    if (!Object.hasOwn(row, "project_id")) {
      const owner = state.sidebarProjects?.find((candidate) =>
        candidate.root_paths?.some((root) => sameProjectPath(root, project)),
      );
      if (owner) row.project_id = owner.id;
    }
    const pending = pendingCreatedSessions();
    pending.set(row.id, row);
    if (pending.size > 100) pending.delete(pending.keys().next().value);
    // The creation receipt is authoritative even before the native index catches up.
    state.listSeq++;
    state.sessions = [
      row,
      ...state.sessions.filter((session) => session.id !== row.id),
    ];
    renderSessions();
    return row;
  }
  function setNavigation(open) {
    document.body.classList.toggle("nav-open", open);
    $("navBackdrop").hidden = !open;
    $("sidebarToggle").setAttribute("aria-expanded", String(open));
  }
  function projectName(path, containingProject = true) {
    const owner = containingProject
      ? owningProject(
          state.sidebarProjects?.flatMap(
            (project) => project.root_paths || [],
          ) || [],
          path,
        )
      : path;
    return (
      state.sidebarProjects?.find((project) =>
        project.root_paths?.some((root) => sameProjectPath(root, owner)),
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
  function syncCreationProject() {
    if (state.selected || state.projectless) return;
    if (state.project && !state.creationProjects.some((project) =>
      sameProjectPath(project.root_paths[0], state.project))) {
      state.project = "";
      state.creationBranch = "";
      state.optionsLoaded = false;
      state.optionsSeq++;
    }
    if (!state.project && state.creationProjects.length === 1)
      state.project = state.creationProjects[0].root_paths[0];
  }
  async function list(append = false, refresh = false, projectChange = false) {
    if (refresh && listRequests) return;
    listRequests++;
    try {
      const scope = JSON.stringify([state.device?.id, getAgent().id]);
      if (scope !== projectScope) {
        projectScope = scope;
        projectLimits = {};
        projectPages = {};
      }
      const seq = ++state.listSeq,
        project = "",
        project_limits = JSON.stringify(projectLimits),
        loaded = refresh || projectChange ? state.next || state.sessions.length : 0;
      let value = await api(
        "sessions?" +
          new URLSearchParams({
            project,
            project_limits,
            offset: String(append ? state.next : 0),
          }),
        undefined,
        { observation: true },
      );
      if (seq !== state.listSeq) return;
      const rows = [...value.sessions];
      while ((refresh || projectChange) && value.has_more && value.next < loaded) {
        const offset = value.next;
        value = await api(
          "sessions?" +
            new URLSearchParams({ project, project_limits, offset: String(offset) }),
          undefined,
          { observation: true },
        );
        if (seq !== state.listSeq) return;
        rows.push(...value.sessions);
        if (!(value.next > offset)) break;
      }
      projectPages = value.project_sessions || {};
      rows.push(...Object.values(projectPages).flatMap((page) => page.sessions));
      for (const capability of [
        "controls_options",
        "connection_metadata",
        "inventory_options",
        "projectless_creation",
      ])
        if (typeof value.capabilities?.[capability] === "boolean")
          state.catalog.capabilities[capability] =
            value.capabilities[capability];
      state.projects = value.projects || [];
      state.sidebarProjects = value.sidebar_projects || null;
      state.creationProjects = selectableProjects(
        state.projects,
        value.creation_projects ?? value.sidebar_projects,
      );
      state.pinnedIDs = value.pinned_ids || [];
      const archived = new Set(value.archived_ids || []);
      const pending = pendingCreatedSessions();
      for (const session of rows) pending.delete(session.id);
      for (const id of archived) pending.delete(id);
      if (!value.history_unavailable)
        for (const [id, session] of pending)
          if (!sessionProject(state.projects, state.sidebarProjects, session))
            pending.delete(id);
      const pendingRows = [...pending.values()].map(
        (session) =>
          state.sessions.find((row) => row.id === session.id) || session,
      );
      const merged = new Map(
        [...pendingRows, ...(append ? state.sessions : []), ...rows].map(
          (session) => [session.id, session],
        ),
      );
      state.sessions = [...merged.values()].filter(
        (session) => !archived.has(session.id),
      );
      if (archived.has(state.selected)) archiveConversation(state.selected);
      if (value.history_unavailable && state.selected)
        unavailableConversation(value.history_warning);
      state.next = value.next;
      $("more").hidden = !value.has_more;
      syncCreationProject();
      showWorkspace();
      renderProjects();
      renderSessions();
      updateControls();
      const viewScope = JSON.stringify([state.device?.id, getAgent().id]);
      if (restoredScope !== viewScope) {
        restoredScope = viewScope;
        const restored = restoreSession();
        if (
          !state.selected &&
          !$("message").value &&
          !state.attachments.length &&
          !state.skills.length &&
          !state.mentions.length &&
          !state.tools.length &&
          !state.queueEdit &&
          state.sessions.some((session) => session.id === restored)
        )
          await select(restored, false);
      }
      if (!state.optionsLoaded && (!refresh || !state.selected)) await loadOptions();
      if (!refresh && value.history_warning) notice(value.history_warning);
    } finally {
      listRequests--;
    }
  }
  function renderProjects() {
    $("breadcrumbProject").textContent =
      state.projectless
        ? t("Work outside a project")
        : state.cwd || state.project
          ? projectName(state.cwd || state.project)
          : t("Choose a project");
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
    const pinned = new Set(state.pinnedIDs);
    const groups = new Map([
      [
        "pinned",
        {
          name: t("Pinned"),
          icon: "pin",
          sessions: [],
          empty: "No pinned conversations.",
        },
      ],
    ]);
    const nativeProjects = state.creationProjects || [];
    for (const project of nativeProjects)
      groups.set("project:" + project.id, {
        name: project.name,
        path: project.root_paths?.join("\n"),
        icon: "folder",
        project,
        sessions: [],
      });
    const nativeRoots = nativeProjects.flatMap((project) => project.root_paths);
    for (const session of rows) {
      if (session.pinned || pinned.has(session.id)) {
        groups.get("pinned").sessions.push(session);
        continue;
      }
      if (session.projectless === true) continue;
      const root = owningProject(nativeRoots, session.cwd);
      const nativeProject = nativeProjects.find(
          (project) => project.id === session.project_id,
        ) || nativeProjects.find((project) =>
          project.root_paths.some((path) => sameProjectPath(path, root))),
        key = nativeProject ? "project:" + nativeProject.id : "";
      groups.get(key)?.sessions.push(session);
    }
    groups.set("recent", {
      name: t("Latest"),
      icon: "clock",
      empty: "No sessions yet.",
      sessions: rows
        .filter((session) => session.id !== state.selected)
        .sort((a, b) => (Date.parse(b.last) || 0) - (Date.parse(a.last) || 0)),
    });
    groups.set("current", {
      name: t("Current"),
      icon: "agent",
      empty: "No active conversations.",
      sessions: rows.filter(
        (session) => session.id === state.selected || running(session.status),
      ),
    });
    const visibleGroups = [...groups].filter(
      ([, group]) =>
        group.sessions.length || (!query && (group.project || group.empty)),
    );
    const projectGroups = visibleGroups.filter(
      ([, group]) => group.icon === "folder",
    );
    const renderGroup = ([owner, group]) => (
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
          {group.project?.root_paths?.[0] && (
            <Button
              type="button"
              variant="ghost"
              className="project-new-session"
              title={t("New session") + ": " + group.name}
              aria-label={t("New session") + ": " + group.name}
              disabled={state.sending}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                run(async () => {
                  if (state.sending || !(await resetSelection())) return;
                  state.project = group.project.root_paths[0];
                  state.projectless = false;
                  state.optionsLoaded = false;
                  renderProjects();
                  renderSessions();
                  setNavigation(false);
                  const generation = state.generation;
                  await loadOptions();
                  if (generation === state.generation) $("message").focus();
                }, event.currentTarget);
              }}
            >
              <Icon name="edit" />
            </Button>
          )}
        </summary>
        {group.empty && !group.sessions.length && (
          <p className="note session-section-empty">{t(group.empty)}</p>
        )}
        {(group.project ? group.sessions.slice(0, projectLimits[group.project.id] || 5) : group.sessions).map((session) => {
          const date = new Date(session.last);
          return (
            <PanelRow
              key={session.id}
              chosen={session.id === state.selected}
              className={owner === "current" ? "current-session" : undefined}
              data-status={session.status || "unknown"}
              data-id={session.id}
              aria-current={String(session.id === state.selected)}
              title={session.title || t("Untitled session")}
              onClick={(event) =>
                run(() => select(session.id), event.currentTarget)
              }
            >
              <Icon name={owner === "current" ? "agent" : "file"} />
              <span className="session-copy">
                <span className="session-title">
                  {session.title === "New session"
                    ? t("New session")
                    : session.title || t("Untitled session")}
                </span>
                {owner === "current" && session.status && (
                  <span className="session-detail">
                    {t(
                      {
                        running: "Running",
                        inProgress: "Running",
                        starting: "Running",
                        waiting: "Waiting for you",
                        idle: "Ready",
                        completed: "Completed",
                        failed: "Failed",
                        interrupted: "Interrupted",
                        unknown: "Unknown",
                      }[session.status] || "",
                    )}
                  </span>
                )}
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
        {group.project && (group.sessions.length > (projectLimits[group.project.id] || 5) || projectPages[group.project.id]?.has_more) && (
          <Button
            type="button"
            variant="ghost"
            className="subtle project-more"
            aria-label={t("Load more") + ": " + group.name}
            onClick={(event) => run(async () => {
              const id = group.project.id, previous = projectLimits[id] || 5,
                scope = projectScope;
              projectLimits[id] = previous + 5;
              try {
                if (projectPages[id]?.has_more) await list(false, false, true);
                else renderSessions();
              } catch (error) {
                if (scope === projectScope && projectLimits[id] === previous + 5)
                  projectLimits[id] = previous;
                throw error;
              }
            }, event.currentTarget)}
          >
            {t("Load more")}
          </Button>
        )}
      </details>
    );
    renderView(
      $("sessions"),
      <>
        {visibleGroups
          .filter(([, group]) => group.icon === "pin")
          .map(renderGroup)}
        {(projectGroups.length > 0 || !query) && (
          <details
            className="project-group project-collection"
            data-path="all-projects"
            open={query ? true : expanded.get("all-projects") !== false}
          >
            <summary>
              <Icon name="folder" />
              <span>{t("Projects")}</span>
              <Icon name="chevron" className="fold-icon" />
            </summary>
            <div className="project-collection-items">
              {projectGroups.map(renderGroup)}
              {!projectGroups.length && (
                <p className="note session-section-empty">
                  {t("No shared projects.")}
                </p>
              )}
            </div>
          </details>
        )}
        {visibleGroups
          .filter(([, group]) => group.icon === "clock")
          .map(renderGroup)}
        {visibleGroups
          .filter(([owner]) => owner === "current")
          .map(renderGroup)}
        {query && !rows.length && (
          <p className="note">
            {t(query ? "No matching conversations." : "No sessions yet.")}
          </p>
        )}
      </>,
    );
    $("sessionCount").textContent = String(state.sessions.length);
  }

  async function loadOptions(required = false, projectOnly = false) {
    state.inventoryLoading = false;
    const seq = ++state.optionsSeq,
      query = new URLSearchParams();
    if (!state.selected && !state.project &&
        !(state.projectless && state.catalog.capabilities?.projectless_creation === true)) {
      state.optionsLoaded = false;
      updateControls();
      return;
    }
    if (state.project) query.set("project", state.project);
    if (!state.selected && state.projectless) query.set("projectless", "true");
    if (state.selected && !projectOnly) query.set("thread", state.selected);
    const controls = state.catalog.capabilities?.controls_options === true;
    if (controls) query.set("scope", "controls");
    state.optionsLoaded = false;
    updateControls();
    const apply = (result) => {
      if (seq !== state.optionsSeq) return;
      if (result.agent && result.agent.id !== getAgent().id)
        throw new Error("The active agent changed. Refresh before continuing.");
      state.catalog = { ...result, agent: getAgent() };
      if (
        !state.selected &&
        !state.prefs.permission &&
        result.creation_default_permission &&
        result.creation_permissions?.includes(
          result.creation_default_permission,
        )
      )
        state.prefs = {
          ...state.prefs,
          permission: result.creation_default_permission,
        };
      state.optionsLoaded = true;
      updateControls();
      renderRequests(state.currentRequests);
      ensureStream();
      refreshQueue();
      $("capabilityIssue").hidden = !result.errors?.length;
      if ($("sessionInfoDialog").open) void loadInventory();
      return result;
    };
    try {
      return apply(await api("options?" + query));
    } catch (e) {
      if (seq !== state.optionsSeq) return;
      state.optionsLoaded = false;
      if (!state.stream) state.catalog.capabilities = {};
      if (e.message !== "Unknown API") notice(e.message);
      updateControls();
      if (required) throw e;
    }
  }
  function loadInventory() {
    if (!state.optionsLoaded) return Promise.resolve();
    const seq = state.optionsSeq, generation = state.generation;
    const current = () => seq === state.optionsSeq && generation === state.generation;
    if (Array.isArray(state.catalog.skills) && Array.isArray(state.catalog.tools))
      return Promise.resolve(state.catalog);
    if (inventoryRequest?.seq === seq && inventoryRequest.generation === generation)
      return inventoryRequest.promise;
    const query = new URLSearchParams({ project: state.project });
    if (!state.selected && state.projectless) query.set("projectless", "true");
    if (state.selected) query.set("thread", state.selected);
    if (state.catalog.capabilities?.inventory_options === true)
      query.set("scope", "inventory");
    const request = { seq, generation, promise: null };
    inventoryRequest = request;
    state.inventoryLoading = true;
    updateControls();
    request.promise = api("options?" + query).then((result) => {
      if (!current()) return;
      if (result.agent && result.agent.id !== getAgent().id)
        throw new Error("The active agent changed. Refresh before continuing.");
      for (const key of ["skills", "tools", "mcp_servers"])
        if (Object.hasOwn(result, key)) state.catalog[key] = result[key];
      state.catalog.errors = [...new Set([...(state.catalog.errors || []), ...(result.errors || [])])];
      $("capabilityIssue").hidden = !state.catalog.errors.length;
      updateControls();
      return result;
    }).catch((error) => {
      if (current()) notice(error.message);
    }).finally(() => {
      if (inventoryRequest === request) inventoryRequest = null;
      if (current()) {
        state.inventoryLoading = false;
        updateControls();
      }
    });
    return request.promise;
  }
  async function resetSelection() {
    saveReading();
    state.reportedOptions = null;
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
    if (state.projectless) state.project = "";
    state.cwd = "";
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
  async function select(id, connect = true, created) {
    if (state.sending) return;
    if (id === state.selected && !state.selecting) {
      setNavigation(false);
      return connectOriginalOwner();
    }
    saveReading();
    state.reportedOptions = null;
    state.connectingOwner?.controller?.abort();
    closeStream();
    const navigation = ++state.generation;
    state.optionsSeq++;
    state.selecting = navigation;
    try {
      if (!created) await discardDraft(navigation);
    } finally {
      if (state.selecting === navigation) state.selecting = false;
    }
    if (navigation !== state.generation) return;
    state.selected = id;
    state.archivedSelection = "";
    state.ownerUnavailable = false;
    state.session = state.sessions.find((session) => session.id === id) || null;
    state.projectless = state.session?.projectless === true;
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
    if (!created) clearDraft();
    renderSessions();
    setNavigation(false);
    updateControls();
    const generation = state.generation,
      current = () => id === state.selected && generation === state.generation;
    if (state.session?.cwd) {
      state.project = sessionProject(
        state.projects,
        state.sidebarProjects,
        state.session,
      );
    }
    const metadata =
      connect &&
      !created &&
      state.catalog.capabilities?.connection_metadata === true;
    await Promise.all([
      loadOptions(),
      ...(metadata ? [detail(generation)] : []),
      (async () => {
        if (metadata) await connectionMetadata(generation);
        else await detail(generation, created);
        if (current() && connect) await connectOriginalOwner();
      })(),
    ]);
    if (current() && !$("changesPanel").hidden && state.sideTab === "files")
      await loadProjectFiles();
    return current() ? { id, generation } : null;
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
      state.liveRevision++;
      state.prefsLoaded = true;
      updateControls();
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
      optionsSeq = state.optionsSeq,
      project = state.project,
      selected = state.selected,
      projectless = !selected && state.projectless === true,
      scope = [state.device?.id, getAgent().id, projectless ? "projectless" : project],
      current = () =>
        generation === state.generation &&
        project === state.project &&
        projectless === (!state.selected && state.projectless === true) &&
        selected === state.selected &&
        scope[0] === state.device?.id &&
        scope[1] === getAgent().id,
      options = {
        project,
        ...(projectless ? { projectless: true } : {}),
        ...(!selected && state.creationBranch ? { branch: state.creationBranch } : {}),
        ...(!selected ? state.prefs : {}),
        executor: "background",
      };
    let reservation;
    try {
      const catalog = await api(
        "options?" + new URLSearchParams({ project, scope: "creation", ...(projectless ? { projectless: "true" } : {}) }),
      );
      if (catalog?.agent && catalog.agent.id !== getAgent().id)
        throw new Error("The active agent changed. Refresh before continuing.");
      if (!catalog || optionsSeq !== state.optionsSeq || !current())
        throw new Error("Connection failed.");
      if (projectless && catalog.capabilities?.projectless_creation !== true)
        throw new Error("Working outside a project requires an updated agentTools client.");
      if (options.branch && catalog.capabilities?.workspace_git !== true)
        throw new Error("Branch selection requires an updated agentTools client.");
      if (catalog.capabilities?.background_creation !== true)
        throw new Error(
          "Background conversations are unavailable. Update agentTools on your computer and reconnect.",
        );
      if (Array.isArray(catalog.creation_permissions)) {
        const permission =
          options.permission || catalog.creation_default_permission;
        if (
          !catalog.creation_permissions.includes(permission) ||
          (options.mode && options.mode !== "default")
        )
          throw new Error(
            "This mode is unavailable when creating a conversation. Change it after connecting. Your draft is preserved.",
          );
        options.permission = permission;
      }
      if (catalog.capabilities.creation_default_permissions_only === true) {
        if (
          (options.permission && options.permission !== "default") ||
          (options.mode && options.mode !== "default")
        )
          throw new Error(
            "Create with default mode and permissions, then change them after connecting. Your draft is preserved.",
          );
        delete options.permission;
        delete options.mode;
      }
      if (catalog.capabilities.creation_request_id === true) {
        creationRequests ||= createCreationRequests(sessionStorage);
        reservation = creationRequests.reserve(scope, options);
        if (reservation.id) {
          const error = new Error(
            "The conversation was already created. Review it before sending your message.",
          );
          error.createdThreadID = reservation.id;
          throw error;
        }
        options.request_id = reservation.request_id;
      }
      const requestID = reservation?.request_id;
      let writing = requestID && creationWrites.get(requestID);
      if (!writing) {
        writing = api("threads", options);
        if (requestID) creationWrites.set(requestID, writing);
      }
      let value;
      try {
        value = await writing;
      } finally {
        if (requestID && creationWrites.get(requestID) === writing)
          creationWrites.delete(requestID);
      }
      if (reservation && typeof value?.id === "string" && value.id)
        creationRequests.confirm(scope, reservation.request_id, value.id);
      if (!value || typeof value.id !== "string" || !value.id || !current())
        throw new Error("Connection failed.");
      const row = rememberCreatedThread({ ...value, ...(projectless ? { projectless: true } : {}) }, project);
      if (reservation) creationRequests.complete(scope, reservation.request_id);
      return row;
    } catch (error) {
      if (reservation && error.createdThreadID)
        creationRequests.confirm(
          scope,
          reservation.request_id,
          error.createdThreadID,
        );
      if (current() && error.createdThreadID) {
        await recoverCreatedThread(error.createdThreadID);
        if (reservation)
          creationRequests.complete(scope, reservation.request_id);
      }
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
    state.session = rememberCreatedThread(
      {
        id,
        source: getAgent().sourceID,
        title: "New session",
        cwd: state.project,
        ...(state.projectless ? { projectless: true } : {}),
      },
      state.project,
    );
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
  async function create(draftOnly = false) {
    if (state.sending) return;
    if (draftOnly) {
      if (state.selected && !(await resetSelection())) return;
      syncCreationProject();
      renderProjects();
      renderSessions();
      setNavigation(false);
      if (state.project || state.projectless) await loadOptions();
      else chooseComposeProject();
      $("message").focus();
      return;
    }
    if (!state.project && !state.projectless) {
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
    const selection = await select(value.id, false, value);
    list().catch((error) => notice(error.message));
    updateControls();
    return selection;
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
    loadInventory,
    clearDraft,
    setNavigation,
    showWorkspace,
    list,
    createThread,
    forgetCreatedThread,
    clearCreatedThreads,
    applyPreferences,
    create,
    discardDraft,
  };
}
