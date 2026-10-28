import { queueAvailable } from "./owner-capabilities";
export function createComposer({
  $,
  state,
  nativeSettings,
  shouldQueue,
  requireOwner,
  ownerEpoch,
  updateControls,
  renderCurrent,
  notice,
  createThread,
  resetQueue,
  detail,
  ensureStream,
  api,
  applyQueue,
  clearDraft,
  refreshQueue,
  list,
}) {
  async function submit() {
    const text = $("message").value;
    if (
      state.archivedSelection ||
      state.ownerUnavailable ||
      (!state.selected && !state.project &&
        !(state.projectless && state.catalog.capabilities?.projectless_creation === true)) ||
      state.sending ||
      state.queueMutation ||
      state.settingsMutation ||
      state.uploading ||
      (!text.trim() &&
        !state.attachments.length &&
        !state.skills.length &&
        !state.mentions.length &&
        !state.tools.length)
    )
      return;
    const contentKey = () =>
        JSON.stringify([
          $("message").value,
          state.attachments.map((file) => file.id),
          state.skills,
          state.mentions,
          state.tools,
        ]),
      submittedContent = contentKey();
    const draft = {
      text,
      attachments: state.attachments.map((file) => file.id),
      skills: [...state.skills],
      mentions: [...state.mentions],
      tools: [...state.tools],
      ...state.prefs,
    };
    for (const key of ["attachments", "skills", "mentions", "tools"])
      if (!draft[key].length) delete draft[key];
    if (nativeSettings())
      for (const key of ["model", "effort", "mode", "permission"])
        delete draft[key];
    requireOwner(shouldQueue() ? "queue_add" : "send");
    const key = JSON.stringify({
        thread: state.selected,
        project: state.project,
        draft,
      }),
      retry = !!state.queueDraftID && key === state.queueDraftKey,
      queued = shouldQueue() || retry;
    if (queued && !queueAvailable(state.catalog.capabilities))
      throw new Error("Update agentTools on your computer to queue messages.");
    if (queued) {
      if (!retry) {
        state.queueDraftKey = key;
        state.queueDraftID = crypto.randomUUID();
      }
      draft.request_id = state.queueDraftID;
    } else {
      state.queueDraftKey = "";
      state.queueDraftID = "";
    }
    let generation = state.generation,
      id = state.selected;
    let epoch = ownerEpoch(),
      pending = true;
    state.sending = true;
    updateControls();
    const current = () =>
      generation === state.generation &&
      id === state.selected &&
      epoch === ownerEpoch();
    try {
      if (!id) {
        const value = await createThread();
        if (!current()) return;
        state.selected = id = value.id;
        state.session = value;
        state.live = {};
        state.generation++;
        generation = state.generation;
        state.liveRevision = 0;
        resetQueue();
        $("welcome").hidden = true;
        await detail(generation, value);
        epoch = ownerEpoch();
        if (!current()) return;
        if (nativeSettings())
          for (const key of ["model", "effort", "mode", "permission"])
            delete draft[key];
        else Object.assign(draft, state.prefs);
        ensureStream();
      }
      const revision = state.liveRevision;
      const snapshot = await api(
        "threads/" + encodeURIComponent(id) + (queued ? "/queue" : "/turn"),
        draft,
      );
      if (!current()) return;
      if (queued && snapshot?.queue) applyQueue(snapshot);
      if (contentKey() === submittedContent) clearDraft();
      if (!queued && snapshot?.turn_id && revision === state.liveRevision) {
        state.live = {
          ...state.live,
          status: "starting",
          turn_id: snapshot.turn_id,
        };
        state.liveRevision++;
        renderCurrent();
      }
      pending = false;
      state.sending = false;
      updateControls();
      const refreshed = await Promise.allSettled([
        detail(generation),
        ...(queued ? [refreshQueue(true)] : []),
        list(),
      ]);
      if (current())
        for (const result of refreshed)
          if (result.status === "rejected") notice(result.reason.message);
    } finally {
      if (pending && generation === state.generation && id === state.selected) {
        state.sending = false;
        updateControls();
      }
    }
  }
  function resizeComposer() {
    $("message").style.height = "auto";
    $("message").style.height =
      Math.min(210, Math.max(32, $("message").scrollHeight)) + "px";
  }
  function updateLatest() {
    const scroller = $("conversationScroll");
    $("latest").hidden =
      !state.selected ||
      scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 100;
  }

  return { resizeComposer, updateLatest, submit };
}
