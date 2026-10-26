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
  setAgents,
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
    const key = state.deviceConnectionUnknown
      ? "Connection unknown"
      : state.device?.online === false
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
      state.deviceConnectionUnknown
        ? "observing"
        : state.device?.online === false
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
    $("deviceOffline").hidden =
      state.deviceConnectionUnknown || state.device?.online !== false;
    $("deviceDetails").textContent = state.device
      ? [
          state.device.name,
          state.device.id,
          t(
            state.deviceConnectionUnknown
              ? "Connection unknown"
              : state.device.online
                ? "Connected"
                : "Your computer is offline",
          ),
        ]
          .filter(Boolean)
          .join(" · ")
      : "";
  }
  function setDeviceOnline(online, unknown = false) {
    if (!state.device) return;
    state.deviceConnectionUnknown = unknown;
    state.device.online = online;
    if (!online) {
      closeStream();
      clearTimeout(state.timer);
    }
    renderDevice();
    updateControls();
  }
  async function checkDevice(refresh = false) {
    if (state.deviceChecking) return;
    clearTimeout(state.deviceTimer);
    state.deviceChecking = true;
    let deviceChecked = false;
    try {
      if (!window.RemoteSecure.available()) {
        showPair();
        return;
      }
      const previous = state.device,
        value = await api("device");
      state.device = value;
      state.deviceConnectionUnknown = false;
      deviceChecked = true;
      showWorkspace();
      renderDevice();
      updateControls();
      if (value.online) {
        const discovered = state.agentDiscovered;
        let status;
        try {
          const result = await api("agents", undefined, { observation: true });
          status = setAgents(result);
        } catch (error) {
          if (error.status !== 404) {
            state.agentDiscovered = discovered;
            if (!discovered) closeStream();
            updateControls();
            throw error;
          }
          // Older clients support Codex without agent discovery.
          status = setAgents({
            agents: [{ id: "codex", name: "Codex" }],
            default_agent: "codex",
          });
        }
        state.agentDiscovered = true;
        if (!status?.connected) return;
        if (
          !previous ||
          !previous.online ||
          !discovered ||
          status.changed ||
          status.recovered
        ) {
          translate();
          state.optionsLoaded = false;
          await list();
          if (state.selected) await detail(state.generation);
        } else if (!document.hidden)
          await list(false, !refresh).catch((error) => {
            if (error.name !== "AbortError") notice(error.message);
          });
      } else if (!value.online) setDeviceOnline(false);
    } catch (e) {
      if (state.device) {
        if (!deviceChecked) setDeviceOnline(false, true);
        else updateControls();
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
