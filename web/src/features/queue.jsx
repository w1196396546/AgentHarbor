import { renderView } from "../render";
import { Card } from "../components/ui/card";
import { Tag } from "../components/ui/tag";
import { RemoteIcon as Icon } from "../components/RemoteIcon";

export function createQueue({
  state,
  ownerEpoch,
  $,
  api,
  updateControls,
  t,
  projectName,
  ownerCan,
  getLanguage,
  Action,
  requireOwner,
  detail,
}) {
  function shouldQueue() {
    return (
      state.running ||
      state.currentRequests.length > 0 ||
      state.queue.length > 0
    );
  }
  function resetQueue() {
    state.connectingOwner?.controller?.abort();
    state.connectingOwner = false;
    state.connectOwnerFailed = false;
    state.queueFetch?.controller?.abort();
    state.queueMutation?.controller?.abort();
    state.queue = [];
    state.queueRevision = -1;
    state.queueOwnerEpoch = ownerEpoch();
    state.queuePaused = false;
    state.queueError = "";
    state.queueFetched = false;
    state.queueFetch = null;
    state.queueMutation = null;
    state.queueEdit = null;
    if ($("queueEditDialog").open) $("queueEditDialog").close();
    state.ownerEpoch = undefined;
    renderQueue();
  }
  function syncQueueOwner() {
    const epoch = ownerEpoch();
    if (state.queueOwnerEpoch === epoch) return;
    state.queueOwnerEpoch = epoch;
    state.queueFetch?.controller?.abort();
    state.queueMutation?.controller?.abort();
    state.queueFetch = null;
    state.queueMutation = null;
    state.queue = [];
    state.queueRevision = -1;
    state.queuePaused = false;
    state.queueError = "";
    state.queueFetched = false;
  }
  function applyQueue(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.queue)) return;
    syncQueueOwner();
    const revision = Number(snapshot.revision);
    if (Number.isFinite(revision) && revision < state.queueRevision) return;
    state.queue = snapshot.queue;
    state.queueRevision = Number.isFinite(revision)
      ? revision
      : state.queueRevision;
    state.queuePaused = !!snapshot.paused;
    state.queueError = snapshot.error || "";
    renderQueue();
  }
  function applyLiveQueue(live) {
    syncQueueOwner();
    if (Array.isArray(live.queue))
      applyQueue({
        queue: live.queue,
        revision: live.queue_revision,
        paused: live.queue_paused,
        error: live.queue_error,
      });
    else if (Number(live.queue_revision) > state.queueRevision)
      refreshQueue(true);
  }
  async function refreshQueue(force = false) {
    syncQueueOwner();
    if (
      !state.selected ||
      !state.catalog.capabilities?.queue ||
      state.queueFetch ||
      (state.queueFetched && !force)
    )
      return;
    const id = state.selected,
      generation = state.generation,
      epoch = ownerEpoch(),
      request = { controller: new AbortController() },
      current = () =>
        id === state.selected &&
        generation === state.generation &&
        epoch === ownerEpoch();
    state.queueFetch = request;
    try {
      const snapshot = await api(
        "threads/" + encodeURIComponent(id) + "/queue",
        undefined,
        { signal: request.controller.signal },
      );
      if (!current()) return;
      state.queueFetched = true;
      applyQueue(snapshot);
      updateControls();
    } catch (error) {
      if (current()) {
        state.queueError =
          t("Unable to load queued messages.") + " " + t(error.message);
        renderQueue();
      }
    } finally {
      if (state.queueFetch === request) state.queueFetch = null;
    }
  }
  function queueAttachments(entry) {
    return [
      ...(entry.attachments || []).map((file) => ({
        name: file.name || t("Attachment"),
        image: file.image,
        id: file.id,
      })),
      ...(entry.skills || []).map((skill) => ({
        name: skill.name || t("Skill"),
        symbol: "plan",
      })),
      ...(entry.mentions || []).map((file) => ({
        name: file.name || projectName(file.path),
        symbol: "file",
      })),
      ...(entry.tools || []).map((tool) => ({
        name: [tool.server, tool.name].filter(Boolean).join(" / "),
        symbol: "tool",
      })),
    ];
  }
  function renderQueue() {
    const panel = $("queuePanel");
    if (!panel) return;
    panel.hidden =
      !state.selected ||
      (!state.queue.length && !state.queuePaused && !state.queueError);
    $("queueCount").textContent = String(state.queue.length);
    $("resumeQueue").hidden = !state.queuePaused;
    const uncertain = state.queue.some((entry) => entry.status === "uncertain");
    $("resumeQueue").disabled =
      !ownerCan("queue") ||
      !!state.queueMutation ||
      state.sending ||
      state.device?.online === false ||
      uncertain;
    $("queueError").textContent = uncertain
      ? t(
          "A message may already have been sent. Review the conversation before removing it.",
        )
      : state.queueError ||
        t(
          state.queuePaused
            ? "The queue is paused. Review the conversation, then resume when ready."
            : "",
        );
    $("queueError").hidden = !$("queueError").textContent;
    $("queueRequestHint").hidden =
      !state.currentRequests.length || !state.queue.length;
    $("queueRequestHint").textContent = t(
      ownerCan("answer")
        ? "The current approval or question still needs your answer. Queued messages will wait."
        : "The original application is waiting for an answer. Respond there while remote control is unavailable.",
    );
    const key = JSON.stringify([
      state.queue,
      state.running,
      state.turnID,
      state.currentRequests.length,
      !!state.queueMutation,
      state.sending,
      state.device?.online,
      state.live.owner,
      getLanguage(),
    ]);
    if ($("queueList").dataset.key === key) {
      updateQueueEdit();
      return;
    }
    $("queueList").dataset.key = key;
    renderView(
      $("queueList"),
      state.queue.map((entry) => {
        const attachments = queueAttachments(entry),
          blocked =
            !!state.queueMutation ||
            state.sending ||
            state.device?.online === false;
        return (
          <Card key={entry.id} className="queue-row" data-queue-id={entry.id}>
            <div className="queue-message-body">
              {entry.text && <p className="queue-message-text">{entry.text}</p>}
              {attachments.length > 0 && (
                <div className="queue-attachments">
                  {attachments.map((file, index) => (
                    <Tag
                      key={index}
                      className="queue-attachment"
                      title={file.name}
                      icon={
                        <Icon
                          name={file.image ? "image" : file.symbol || "file"}
                        />
                      }
                    >
                      {file.name}
                    </Tag>
                  ))}
                </div>
              )}
              {!entry.text && !attachments.length && (
                <p className="queue-message-text">{t("Message")}</p>
              )}
            </div>
            <div className="queue-actions">
              <Action
                className="icon-button queue-edit"
                aria-label={t("Edit queued message")}
                title={t("Edit queued message")}
                disabled={
                  !ownerCan("queue") || blocked || !editableQueueEntry(entry)
                }
                action={() => beginQueueEdit(entry.id)}
              >
                <Icon name="edit" />
              </Action>
              <Action
                className="queue-steer"
                title={t("Send this message to the current turn now")}
                disabled={
                  !ownerCan("steer") ||
                  blocked ||
                  !state.running ||
                  !state.turnID ||
                  !["waiting", "failed"].includes(entry.status || "waiting")
                }
                action={() => mutateQueue(entry.id, "steer")}
              >
                {t("Steer")}
              </Action>
              <Action
                className="icon-button queue-remove"
                aria-label={t("Remove queued message")}
                title={t("Remove queued message")}
                disabled={
                  !ownerCan("queue") ||
                  blocked ||
                  entry.status === "dispatching"
                }
                action={() => mutateQueue(entry.id, "remove")}
              >
                <Icon name="close" />
              </Action>
            </div>
            <span
              className="queue-status"
              data-status={entry.status || "waiting"}
            >
              {entry.error ||
                t(
                  {
                    waiting: "Waiting",
                    dispatching: "Sending…",
                    failed: "Failed",
                    uncertain: "Delivery uncertain",
                  }[entry.status] || "Waiting",
                )}
            </span>
          </Card>
        );
      }),
    );
    updateQueueEdit();
  }
  function editableQueueEntry(entry) {
    return ["waiting", "failed"].includes(entry.status || "waiting");
  }
  function queueEditInput(entry, text = entry.text || "") {
    const value = { text };
    if (entry.native === true || state.live.owner?.kind === "native")
      return value;
    for (const key of [
      "attachments",
      "skills",
      "mentions",
      "tools",
      "model",
      "effort",
      "mode",
      "permission",
    ])
      if (Object.prototype.hasOwnProperty.call(entry, key))
        value[key] =
          key === "attachments"
            ? (entry.attachments || []).map((file) =>
                typeof file === "string" ? file : file.id,
              )
            : entry[key];
    return value;
  }
  function beginQueueEdit(id) {
    requireOwner("queue");
    if (state.queueMutation || state.sending || state.queueEdit) return;
    const entry = state.queue.find((item) => item.id === id);
    if (!entry || !editableQueueEntry(entry)) return;
    state.queueEdit = {
      id,
      thread: state.selected,
      generation: state.generation,
      epoch: ownerEpoch(),
    };
    $("queueEditText").value = entry.text || "";
    $("queueEditError").textContent = "";
    $("queueEditError").hidden = true;
    $("queueEditDialog").showModal();
    $("queueEditText").focus();
    updateQueueEdit();
  }
  function updateQueueEdit() {
    const edit = state.queueEdit;
    if (!edit) return;
    const entry =
      state.selected === edit.thread && state.generation === edit.generation
        ? state.queue.find((item) => item.id === edit.id)
        : null;
    const text = $("queueEditText").value,
      unchanged = entry && text === (entry.text || "");
    $("saveQueueEdit").disabled =
      !entry ||
      !editableQueueEntry(entry) ||
      !ownerCan("queue") ||
      ownerEpoch() !== edit.epoch ||
      !!state.queueMutation ||
      state.sending ||
      state.device?.online === false ||
      unchanged;
    $("queueEditText").disabled = !!state.queueMutation;
    $("cancelQueueEdit").disabled = !!state.queueMutation;
  }
  function cancelQueueEdit() {
    if (state.queueMutation) return;
    state.queueEdit = null;
    if ($("queueEditDialog").open) $("queueEditDialog").close();
    renderQueue();
  }
  async function saveQueueEdit() {
    const edit = state.queueEdit;
    if (!edit || state.queueMutation || state.sending) return;
    requireOwner("queue");
    const current = () =>
      state.queueEdit === edit &&
      state.selected === edit.thread &&
      state.generation === edit.generation &&
      ownerEpoch() === edit.epoch;
    const entry = state.queue.find((item) => item.id === edit.id);
    if (!current() || !entry || !editableQueueEntry(entry))
      throw new Error(t("This queued message is no longer editable."));
    const mutation = { controller: new AbortController() };
    state.queueMutation = mutation;
    $("queueEditError").textContent = "";
    $("queueEditError").hidden = true;
    updateControls();
    try {
      const snapshot = await api(
        "threads/" +
          encodeURIComponent(edit.thread) +
          "/queue/" +
          encodeURIComponent(edit.id),
        queueEditInput(entry, $("queueEditText").value),
        { method: "PATCH", signal: mutation.controller.signal },
      );
      if (!current()) return;
      if (!Array.isArray(snapshot?.queue))
        throw new Error("Unable to confirm queued message update.");
      applyQueue(snapshot);
      state.queueEdit = null;
      $("queueEditDialog").close();
    } catch (error) {
      if (current()) {
        $("queueEditError").textContent = t(error.message);
        $("queueEditError").hidden = false;
        throw error;
      }
    } finally {
      if (state.queueMutation === mutation) {
        state.queueMutation = null;
        updateControls();
      }
    }
  }
  async function mutateQueue(id, action) {
    requireOwner(action === "steer" ? "steer" : "queue");
    if (state.queueMutation || state.sending || !state.selected) return;
    const entry = id ? state.queue.find((item) => item.id === id) : null;
    if (id && !entry) return;
    if (
      action === "steer" &&
      (!state.running ||
        !state.turnID ||
        !["waiting", "failed"].includes(entry.status || "waiting"))
    )
      return;
    if (action === "remove" && entry.status === "dispatching") return;
    if (
      action === "resume" &&
      (!state.queuePaused ||
        state.queue.some((item) => item.status === "uncertain"))
    )
      return;
    const thread = state.selected,
      generation = state.generation,
      epoch = ownerEpoch(),
      turn = state.turnID,
      mutation = { controller: new AbortController() };
    state.queueMutation = mutation;
    updateControls();
    try {
      const path =
        "threads/" +
        encodeURIComponent(thread) +
        "/queue" +
        (action === "resume"
          ? "/resume"
          : "/" +
            encodeURIComponent(id) +
            (action === "steer" ? "/steer" : ""));
      const snapshot = await api(
        path,
        action === "remove"
          ? undefined
          : action === "steer"
            ? { expected_turn_id: turn }
            : {},
        {
          ...(action === "remove" ? { method: "DELETE" } : {}),
          signal: mutation.controller.signal,
        },
      );
      if (
        thread !== state.selected ||
        generation !== state.generation ||
        epoch !== ownerEpoch()
      )
        return;
      if (snapshot?.queue) applyQueue(snapshot);
      else await refreshQueue(true);
      await detail(generation);
    } catch (error) {
      if (
        thread === state.selected &&
        generation === state.generation &&
        epoch === ownerEpoch()
      )
        throw error;
    } finally {
      if (state.queueMutation === mutation) {
        state.queueMutation = null;
        updateControls();
      }
    }
  }

  return {
    renderQueue,
    refreshQueue,
    shouldQueue,
    applyLiveQueue,
    resetQueue,
    applyQueue,
    saveQueueEdit,
    updateQueueEdit,
    cancelQueueEdit,
    mutateQueue,
  };
}
