export function ownerCapability(capabilities, requested) {
  if (
    requested.startsWith("queue_") &&
    !Object.hasOwn(capabilities || {}, requested)
  )
    return "queue";
  return requested;
}

export function queueAvailable(capabilities) {
  return (
    capabilities?.queue === true ||
    [
      "queue_read",
      "queue_add",
      "queue_cancel",
      "queue_reorder",
      "queue_edit",
      "queue_resume",
    ].some((key) => capabilities?.[key] === true)
  );
}

export function messageCapability(state) {
  return state.running || state.currentRequests?.length || state.queue?.length
    ? "queue_add"
    : "send";
}

export function queueActionCapability(action, method) {
  if (action === "queue") return "queue_add";
  if (action === "queue/resume") return "queue_resume";
  if (action.endsWith("/reorder")) return "queue_reorder";
  if (method === "DELETE") return "queue_cancel";
  if (method === "PATCH") return "queue_edit";
  return "queue";
}

export function nativePendingPlan(state, plan = state.pendingPlan) {
  return (
    state.live?.pending_plan_approval === true &&
    typeof plan?.id === "string" &&
    !!plan.id &&
    state.live.pending_plan?.id === plan.id
  );
}

export function planBlockedWhileRunning(state) {
  return (
    (state.running || state.live?.pending_plan_approval === true) &&
    !nativePendingPlan(state)
  );
}

export function planRevisionRequest(state, feedback, fallback) {
  if (state.live?.pending_plan_approval === true && !nativePendingPlan(state))
    throw new Error(
      "The plan changed. Close this dialog and review the latest conversation.",
    );
  return nativePendingPlan(state)
    ? {
        action: "revise-plan",
        payload: { plan_id: state.pendingPlan.id, feedback },
      }
    : { action: "turn", payload: fallback };
}
