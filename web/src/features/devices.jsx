export function createDevices({
  state,
  nativeSettings,
  $,
  t,
  closeStream,
  updateControls,
  showPair,
  api,
  translate,
  switchAgent,
  showWorkspace,
  notice,
  list,
  detail,
}) {
  function updateConnection() {
    const blocked =
      state.selected &&
      nativeSettings() &&
      state.live.owner?.state !== "connected";
    const key =
      state.device?.online === false
        ? "Your computer is offline"
        : state.archivedSelection
          ? "Archived"
          : state.connectingOwner
            ? "Connecting this conversation…"
            : blocked
              ? "Codex control is not connected"
              : !state.selected || state.streamMode === "closed"
                ? "Connected to your computer"
                : state.streamMode === "open"
                  ? "Live updates"
                  : state.streamMode === "connecting"
                    ? "Connecting live updates…"
                    : state.streamMode === "retrying"
                      ? "Reconnecting live updates…"
                      : "Live stream unavailable; refreshing periodically.";
    if (state.device)
      window.dispatchEvent(
        new CustomEvent("remote-device-status", {
          detail: { ...state.device, connection: key },
        }),
      );
    $("connectionLabel").textContent = t(key);
    $("connectionLabel").parentElement.dataset.state =
      state.device?.online === false
        ? "offline"
        : blocked || state.archivedSelection
          ? "observing"
          : state.streamMode;
  }
  function renderDevice() {
    window.dispatchEvent(
      new CustomEvent("remote-device-status", { detail: state.device }),
    );
    $("deviceName").textContent = state.device?.name || t("Connected computer");
    $("deviceName").title = state.device?.id || "";
    $("deviceOffline").hidden = state.device?.online !== false;
    $("deviceDetails").textContent = state.device
      ? [
          state.device.name,
          state.device.id,
          t(state.device.online ? "Connected" : "Your computer is offline"),
        ]
          .filter(Boolean)
          .join(" · ")
      : "";
  }
  function setDeviceOnline(online) {
    if (!state.device) return;
    state.device.online = online;
    if (!online) {
      closeStream();
      clearTimeout(state.timer);
    }
    renderDevice();
    updateControls();
  }
  async function checkDevice() {
    if (state.deviceChecking) return;
    clearTimeout(state.deviceTimer);
    state.deviceChecking = true;
    try {
      if (!window.RemoteSecure.available()) {
        showPair();
        return;
      }
      const previous = state.device,
        value = await api("device");
      state.device = value;
      showWorkspace();
      renderDevice();
      updateControls();
      if (
        value.online &&
        (!previous || !previous.online || !state.agentDiscovered)
      ) {
        notice();
        try {
          const result = await api("agents");
          const id = result.default_agent;
          const agent =
            Array.isArray(result.agents) &&
            result.agents.find((agent) => agent?.id === id);
          if (
            !agent ||
            typeof agent.id !== "string" ||
            !agent.id ||
            typeof agent.name !== "string"
          )
            throw new Error("The connected agent could not be verified.");
          switchAgent(agent);
        } catch (error) {
          if (error.status !== 404) {
            state.agentDiscovered = false;
            closeStream();
            updateControls();
            throw error;
          }
          // Older clients support Codex without agent discovery.
          switchAgent({ id: "codex", name: "Codex" });
        }
        state.agentDiscovered = true;
        translate();
        state.optionsLoaded = false;
        await list();
        if (state.selected) await detail(state.generation);
      } else if (!value.online) setDeviceOnline(false);
      else if (!document.hidden) await list(false, true).catch(() => {});
    } catch (e) {
      if (state.device) {
        setDeviceOnline(false);
        notice(
          e.name === "AbortError"
            ? "Connection timed out. Try again."
            : e.message,
        );
      } else if (!$("pair").hidden) {
        if (e.message !== "Pair this browser first") notice(e.message);
      } else throw e;
    } finally {
      state.deviceChecking = false;
      if (state.device)
        state.deviceTimer = setTimeout(() => checkDevice(), 10000);
    }
  }

  return { renderDevice, updateConnection, checkDevice, setDeviceOnline };
}
