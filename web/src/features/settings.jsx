export function createSettings({
  $,
  canConfigure,
  state,
  applyPreferences,
  showMenu,
  selectedModel,
  closeMenu,
  ownerEpoch,
  ownerCan,
  effortName,
  t,
  run,
  getAgent,
}) {
  function modelMenu(trigger = $("model")) {
    if (!canConfigure()) return;
    const entries = [
      { heading: "Model" },
      {
        label: "Configured model",
        description: "Use the model configured on your computer.",
        selected: !state.prefs.model,
        action: () => {
          const defaults = state.catalog.defaults || {},
            model = getAgent().defaultModel(state.catalog);
          if (!defaults.model && !model)
            throw new Error(t(getAgent().emptyModelsMessage));
          const effort = defaults.effort || getAgent().defaultEffort(model);
          return applyPreferences({
            model: defaults.model || getAgent().modelID(model),
            effort: effort || "",
          });
        },
      },
    ];
    for (const model of state.catalog.models || [])
      entries.push({
        label: getAgent().modelName(model),
        description: model.description,
        selected: state.prefs.model === getAgent().modelID(model),
        action: () => {
          return applyPreferences({
            model: getAgent().modelID(model),
            effort: getAgent().defaultEffort(model) || "",
          });
        },
      });
    if (!state.catalog.models?.length)
      entries.push({ note: getAgent().emptyModelsMessage });
    showMenu(trigger, entries);
  }
  function reasoningModel() {
    const model = selectedModel();
    if (model || state.prefs.model) return model;
    return getAgent().defaultModel(state.catalog);
  }
  function reasoningEfforts() {
    return getAgent().reasoningEfforts(reasoningModel());
  }
  function reasoningDefault() {
    const model = reasoningModel(),
      defaults = state.catalog.defaults || {},
      effort =
        getAgent().defaultEffort(model) ||
        (!state.prefs.model || state.prefs.model === defaults.model
          ? defaults.effort
          : "");
    return reasoningEfforts().some((entry) => entry.reasoningEffort === effort)
      ? effort
      : "";
  }
  function closeReasoning(focus = true) {
    const card = $("reasoningCard"),
      trigger = card._trigger;
    card.hidden = true;
    card._trigger = null;
    state.reasoningPreview = null;
    for (const id of ["model", "effort"])
      $(id).setAttribute("aria-expanded", "false");
    if ($("menu")._trigger?.id === "reasoningModel") closeMenu();
    if (focus && trigger?.isConnected) trigger.focus({ preventScroll: true });
  }
  function renderReasoning() {
    const card = $("reasoningCard");
    if (card.hidden) return;
    if (
      card.dataset.generation !== String(state.generation) ||
      card.dataset.epoch !== ownerEpoch() ||
      !ownerCan("configure") ||
      state.running ||
      state.sending ||
      !state.optionsLoaded
    ) {
      closeReasoning(false);
      return;
    }
    const model = reasoningModel(),
      efforts = reasoningEfforts(),
      current = state.prefs.effort || reasoningDefault();
    if (state.reasoningPreview?.model !== getAgent().modelID(model))
      state.reasoningPreview = null;
    const effort = state.reasoningPreview?.effort || current,
      index = efforts.findIndex((entry) => entry.reasoningEffort === effort),
      range = $("reasoningRange");
    $("reasoningLabel").textContent = effortName(effort);
    $("reasoningModelName").textContent =
      getAgent().modelName(model) || state.prefs.model || t("Configured model");
    const selectedIndex = Math.max(0, index),
      lastIndex = Math.max(0, efforts.length - 1);
    range.min = "0";
    range.max = String(lastIndex);
    range.value = String(selectedIndex);
    range.style.setProperty(
      "--progress",
      `${lastIndex ? (selectedIndex / lastIndex) * 100 : 0}%`,
    );
    range.style.setProperty("--steps", String(Math.max(1, lastIndex)));
    range.setAttribute("aria-valuetext", effortName(effort));
    range.disabled = !canConfigure() || efforts.length < 2;
    $("reasoningModel").disabled = !canConfigure();
    const defaultEffort = reasoningDefault();
    $("reasoningReset").disabled =
      !canConfigure() || !defaultEffort || current === defaultEffort;
    $("reasoningDescription").textContent = efforts[index]?.description || "";
    const hint = state.settingsMutation
      ? "Saving settings…"
      : !efforts.length
        ? "Select a model to see its reasoning levels."
        : "";
    $("reasoningHint").textContent = t(hint);
    $("reasoningHint").hidden = !hint;
    positionReasoning();
  }
  function openReasoning(trigger) {
    if (!canConfigure()) return;
    closeMenu();
    const card = $("reasoningCard");
    card._trigger = trigger;
    card.dataset.generation = String(state.generation);
    card.dataset.epoch = ownerEpoch();
    card.hidden = false;
    state.reasoningPreview = null;
    renderReasoning();
    trigger.setAttribute("aria-expanded", "true");
    positionReasoning();
    ($("reasoningRange").disabled
      ? $("reasoningModel")
      : $("reasoningRange")
    ).focus({ preventScroll: true });
  }
  function positionReasoning() {
    const card = $("reasoningCard"),
      trigger = card._trigger;
    if (card.hidden || !trigger) return;
    const rect = trigger.getBoundingClientRect(),
      width = card.offsetWidth,
      height = card.offsetHeight;
    card.style.left =
      Math.max(12, Math.min(innerWidth - width - 12, rect.left)) + "px";
    card.style.top =
      Math.max(
        12,
        Math.min(innerHeight - height - 12, rect.top - height - 10),
      ) + "px";
  }
  function commitReasoning() {
    const card = $("reasoningCard"),
      entry = reasoningEfforts()[Number($("reasoningRange").value)];
    if (
      card.hidden ||
      card.dataset.generation !== String(state.generation) ||
      card.dataset.epoch !== ownerEpoch() ||
      !canConfigure() ||
      !entry
    ) {
      state.reasoningPreview = null;
      renderReasoning();
      return;
    }
    return run(async () => {
      try {
        await applyPreferences({ effort: entry.reasoningEffort });
      } finally {
        state.reasoningPreview = null;
        renderReasoning();
      }
    }, $("reasoningRange"));
  }
  function modeMenu() {
    if (!canConfigure()) return;
    const modes = getAgent().modes(state.catalog);
    showMenu($("mode"), [
      { heading: "Collaboration mode" },
      ...modes.map((mode) => ({
        label: getAgent().modeLabel(mode),
        description: getAgent().modeDescription(mode),
        icon: "plan",
        selected: (state.prefs.mode || "default") === mode.mode,
        action: () => {
          return applyPreferences({ mode: mode.mode });
        },
      })),
    ]);
  }
  function permissionMenu() {
    if (!canConfigure()) return;
    const profiles = getAgent().permissionProfiles(state.catalog);
    showMenu($("permission"), [
      { heading: "Computer permissions" },
      ...profiles.map((profile) => ({
        label: profile.name,
        description: profile.description,
        disabled: profile.available === false,
        reason:
          profile.reason ||
          (profile.available === false
            ? "This permission mode is unavailable on this computer."
            : ""),
        icon: "shield",
        selected: state.prefs.permission === profile.id,
        action: () => {
          if (profile.available === false) return;
          if (
            profile.id === "full-access" &&
            state.prefs.permission !== "full-access"
          ) {
            $("permissionDialog").dataset.ownerEpoch = ownerEpoch();
            $("permissionDialog").showModal();
          } else {
            return applyPreferences({ permission: profile.id });
          }
        },
      })),
    ]);
  }

  return {
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
  };
}
