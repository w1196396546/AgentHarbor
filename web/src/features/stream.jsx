export function createStream({
  state,
  getAgent,
  updateConnection,
  $,
  archiveConversation,
  unavailableConversation,
  mergeOrdered,
  renderCurrent,
  checkDevice,
  detail,
  notice,
}) {
  function closeStream() {
    const stream = state.stream;
    state.stream = null;
    state.streamThread = "";
    state.streamMode = "closed";
    if (stream) stream.close();
    updateConnection();
  }
  function ensureStream() {
    const agent = state.agents?.find((value) => value.id === getAgent().id);
    if (
      !state.selected ||
      (agent?.state && agent.state !== "connected") ||
      state.ownerUnavailable ||
      $("workspace").hidden ||
      state.device?.online === false
    )
      return;
    const streaming =
      state.catalog.capabilities?.streaming ||
      state.live.owner?.capabilities?.background_connect === true ||
      state.live.owner?.kind === "background";
    if (!streaming) {
      if (state.stream) closeStream();
      state.streamMode = "fallback";
      updateConnection();
      return;
    }
    if (
      state.stream &&
      state.streamThread === state.selected &&
      state.streamGeneration === state.generation
    )
      return;
    closeStream();
    clearTimeout(state.timer);
    const id = state.selected,
      generation = state.generation;
    let source;
    try {
      source = window.RemoteSecure.events(
        "sessions/" + encodeURIComponent(id) + "/events",
        { headers: { "X-Remote-Agent": getAgent().id } },
      );
    } catch {
      state.streamMode = "fallback";
      updateConnection();
      schedulePoll(generation);
      return;
    }
    state.stream = source;
    state.streamThread = id;
    state.streamGeneration = generation;
    state.streamMode = "connecting";
    updateConnection();
    const current = () =>
      state.stream === source &&
      state.selected === id &&
      state.generation === generation;
    source.addEventListener("archived", (event) => {
      if (!current()) return;
      let value;
      try {
        value = JSON.parse(event.data);
      } catch {
        return;
      }
      if (value?.id === id) archiveConversation(id);
    });
    source.addEventListener("unavailable", (event) => {
      if (!current()) return;
      let value;
      try {
        value = JSON.parse(event.data);
      } catch {
        value = {};
      }
      unavailableConversation(value?.error);
    });
    source.onopen = () => {
      if (!current()) return;
      state.streamMode = "open";
      clearTimeout(state.timer);
      updateConnection();
    };
    source.addEventListener("live", (event) => {
      if (!current()) return;
      let packet;
      try {
        packet = JSON.parse(event.data);
        if (
          !Array.isArray(packet.items) ||
          (packet.state && typeof packet.state !== "object")
        )
          throw new Error();
      } catch {
        source.close();
        state.stream = null;
        state.streamMode = "fallback";
        updateConnection();
        schedulePoll(generation);
        return;
      }
      const old = state.live.items || [],
        nextState = { ...state.live, ...(packet.state || {}) },
        removed = new Set(packet.remove || []),
        newIDs = new Set(packet.items.map((item) => item.id)),
        newTurn =
          packet.state?.turn_id &&
          state.live.turn_id &&
          packet.state.turn_id !== state.live.turn_id;
      if (
        packet.state?.owner &&
        packet.state.owner.epoch !== state.live.owner?.epoch &&
        !Object.hasOwn(packet.state, "options")
      )
        delete nextState.options;
      const synthetic = (item) =>
          item.type === "userMessage" && item.id.startsWith("native-input-"),
        hydratedTurns = new Set(
          packet.items
            .filter((item) => item.type === "userMessage" && !synthetic(item))
            .map(
              (item) =>
                item.turn_id || packet.state?.turn_id || state.live.turn_id,
            ),
        );
      state.history = state.history.filter(
        (item) => !synthetic(item) || !hydratedTurns.has(item.turn_id),
      );
      state.history = mergeOrdered(
        state.history,
        old.filter(
          (item) =>
            newTurn ||
            (!synthetic(item) &&
              (removed.has(item.id) || (packet.reset && !newIDs.has(item.id)))),
        ),
      );
      const items = new Map(
        (packet.reset ? [] : old.filter((item) => !removed.has(item.id))).map(
          (item) => [item.id, item],
        ),
      );
      for (const item of packet.items) items.set(item.id, item);
      state.live = { ...nextState, items: [...items.values()] };
      state.lastSyncedAt = Date.now();
      state.liveRevision++;
      state.streamMode = "open";
      clearTimeout(state.timer);
      renderCurrent();
    });
    source.onerror = () => {
      if (!current()) return;
      checkDevice();
      state.streamMode = "retrying";
      updateConnection();
      if (source.readyState === 2) {
        source.close();
        state.stream = null;
        state.streamMode = "fallback";
        updateConnection();
        schedulePoll(generation);
      }
    };
  }
  function schedulePoll(generation) {
    clearTimeout(state.timer);
    if (state.device?.online === false || state.ownerUnavailable) return;
    if (
      state.stream ||
      (state.catalog.capabilities?.streaming && state.streamMode !== "fallback")
    )
      return;
    if (state.running || state.currentRequests.length || state.live.owner)
      state.timer = setTimeout(
        () => poll(generation),
        state.catalog.capabilities?.streaming || document.hidden ? 5000 : 1000,
      );
  }
  async function poll(generation) {
    try {
      await detail(generation);
    } catch (e) {
      if (generation === state.generation) {
        notice(e.message);
        if (!$("workspace").hidden)
          state.timer = setTimeout(() => poll(generation), 5000);
      }
    }
  }

  return { ensureStream, closeStream, schedulePoll, poll };
}
