export function createOwners({
  t,
  state,
  showMenu,
  $,
  projectName,
  resetSelection,
  renderProjects,
  loadOptions,
  updateControls,
  closeMenu,
  closeReasoning,
  updateConnection,
  api,
  detail,
  ensureStream,
  renderCurrent,
  mergeOrdered,
  getAgent,
}) {
  function sourceLabel(source) {
    return t(getAgent().sourceLabel(source));
  }

  function ownerEpoch() {
    return state.live.owner?.epoch || "";
  }
  function nativeSession() {
    return state.session?.source && state.session.source !== "remote";
  }
  function nativeSettings() {
    return (
      ["native", "background"].includes(state.live.owner?.kind) ||
      nativeSession()
    );
  }
  function ownerCan(capability) {
    if (
      !state.agentDiscovered ||
      state.device?.online === false ||
      state.archivedSelection ||
      state.ownerUnavailable
    )
      return false;
    if (!state.selected) return true;
    const owner = state.live.owner;
    if (!owner) return !nativeSession();
    return (
      owner.state === "connected" && owner.capabilities?.[capability] === true
    );
  }
  function canConfigure() {
    return (
      ownerCan("configure") &&
      !state.running &&
      !state.sending &&
      !state.settingsMutation &&
      state.optionsLoaded
    );
  }
  function requireOwner(capability) {
    if (!ownerCan(capability))
      throw new Error(
        state.live.owner?.notice ||
          "The original application is unavailable for this action. Your draft is preserved.",
      );
  }
  function actionCapability(path, method) {
    if (method === "GET" || method === "HEAD") return "";
    if (/^attachments(?:\?|$)/.test(path) && method === "POST") return "send";
    const match = path.match(/^threads\/([^/]+)\/(.+?)(?:\?|$)/);
    if (!match || decodeURIComponent(match[1]) !== state.selected) return "";
    const action = match[2];
    return action === "settings"
      ? "configure"
      : action === "turn"
        ? "send"
        : action === "interrupt"
          ? "interrupt"
          : action === "answer"
            ? "answer"
            : action === "execute-plan"
              ? "plan"
              : /\/steer$/.test(action) || action === "steer"
                ? "steer"
                : action.startsWith("queue")
                  ? "queue"
                  : "";
  }
  function chooseComposeProject() {
    showMenu($("breadcrumbProject"), [
      { heading: "New conversation folder" },
      ...state.projects.map((path) => ({
        label: projectName(path),
        description: path,
        icon: "folder",
        selected: path === state.project,
        action: async () => {
          if (state.sending || !(await resetSelection())) return;
          state.project = path;
          state.optionsLoaded = false;
          renderProjects();
          await loadOptions();
          updateControls();
        },
      })),
    ]);
  }
  function renderOwner() {
    const owner = state.live.owner,
      epoch = ownerEpoch(),
      changed = state.ownerEpoch !== undefined && state.ownerEpoch !== epoch,
      blocked = !!state.selected && !ownerCan("send"),
      background = owner?.capabilities?.background_connect === true,
      canConnect = background && owner.state !== "connected",
      needsUpdate =
        !background &&
        owner?.capabilities?.connect === true &&
        owner.state !== "connected";
    if (changed) {
      closeMenu();
      closeReasoning(false);
      for (const id of [
        "permissionDialog",
        "executePlanDialog",
        "revisePlanDialog",
        "requestDialog",
      ])
        if ($(id).open) $(id).close();
    }
    state.ownerEpoch = owner ? epoch : undefined;
    $("sourceBadge").hidden = !state.selected || !state.session?.source;
    $("sourceBadge").textContent = sourceLabel(state.session?.source);
    $("ownerNotice").textContent = t(
      state.archivedSelection
        ? "This conversation is archived in Codex. Your unsent draft is preserved."
        : state.connectingOwner
          ? "Connecting this conversation…"
          : state.connectOwnerFailed && canConnect
            ? "Connection failed. Your draft is preserved. Retry the connection."
            : needsUpdate
              ? "Background conversations are unavailable. Update agentTools on your computer and reconnect."
              : owner?.notice ||
                (blocked
                  ? "The original application is unavailable for this action. Your draft is preserved."
                  : owner?.kind === "native"
                    ? "Connected to the original application."
                    : ""),
    );
    $("ownerBanner").hidden =
      (!state.selected && !state.archivedSelection) ||
      (!$("ownerNotice").textContent && !canConnect);
    $("connectOwner").hidden = !canConnect;
    $("connectOwner").disabled =
      state.connectingOwner || state.device?.online === false;
    $("connectOwner").textContent = t(
      state.connectingOwner
        ? "Connecting…"
        : state.connectOwnerFailed
          ? "Retry connection"
          : "Connect",
    );
    $("connectOwner").title = t(
      "Connect without switching the desktop conversation.",
    );
    if (!ownerCan("configure")) {
      if (
        ["model", "effort", "reasoningModel", "mode", "permission"].includes(
          $("menu")._trigger?.id,
        )
      )
        closeMenu();
      closeReasoning(false);
      if ($("permissionDialog").open) $("permissionDialog").close();
    }
    if (!ownerCan("plan"))
      for (const id of ["executePlanDialog", "revisePlanDialog"])
        if ($(id).open) $(id).close();
    if (
      !ownerCan(
        state.currentRequests[0]?.method === "agentMessage/questions"
          ? "steer"
          : "answer",
      )
    ) {
      if ($("requestDialog").open) $("requestDialog").close();
      $("pendingRequest").hidden = true;
    }
  }
  async function connectOriginalOwner() {
    const owner = state.live.owner;
    if (
      !state.selected ||
      state.connectingOwner ||
      state.archivedSelection ||
      state.ownerUnavailable ||
      state.device?.online === false ||
      owner?.state === "connected" ||
      owner?.capabilities?.background_connect !== true
    )
      return;
    const id = state.selected,
      generation = state.generation,
      request = { controller: new AbortController() },
      revision = state.liveRevision,
      current = () => id === state.selected && generation === state.generation;
    state.connectingOwner = request;
    state.connectOwnerFailed = false;
    renderOwner();
    updateConnection();
    try {
      const result = await api(
        "threads/" + encodeURIComponent(id) + "/connect",
        { executor: "background" },
        { signal: request.controller.signal },
      );
      if (!current()) return;
      if (
        result?.connected === true &&
        result.live &&
        typeof result.live === "object" &&
        !Array.isArray(result.live) &&
        result.live.owner?.state === "connected"
      ) {
        if (revision === state.liveRevision) {
          state.history = mergeOrdered(state.history, state.live.items || []);
          state.live = result.live;
          state.liveRevision++;
          renderCurrent();
        }
      } else await detail(generation);
      if (current()) ensureStream();
    } catch (error) {
      if (id === state.selected && generation === state.generation) {
        state.connectOwnerFailed = true;
        throw error;
      }
    } finally {
      if (state.connectingOwner === request) state.connectingOwner = false;
      if (id === state.selected && generation === state.generation) {
        renderOwner();
        updateConnection();
      }
    }
  }

  return {
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
  };
}
