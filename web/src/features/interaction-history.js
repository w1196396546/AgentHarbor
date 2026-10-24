const statuses = new Set([
  "pending",
  "approved",
  "declined",
  "answered",
  "cancelled",
  "expired",
  "unknown",
]);

export function normalizeInteractions(values) {
  return (Array.isArray(values) ? values : []).flatMap((value) => {
    if (!value || typeof value.request_id !== "string" || !value.request_id)
      return [];
    const interaction = {
      request_id: value.request_id,
      status: statuses.has(value.status) ? value.status : "unknown",
    };
    for (const key of ["method", "item_id", "turn_id", "summary", "reason"])
      if (typeof value[key] === "string") interaction[key] = value[key];
    if (
      Number.isFinite(value.resolved_at_ms) &&
      value.resolved_at_ms > 0 &&
      value.resolved_at_ms <= 8640000000000000
    )
      interaction.resolved_at_ms = value.resolved_at_ms;
    return [interaction];
  });
}

export function interactionItems(values) {
  return normalizeInteractions(values)
    .filter((value) => value.status !== "pending")
    .map((value) => ({
      id: "interaction-history-" + value.request_id,
      source_item_id: value.item_id,
      turn_id: value.turn_id,
      type: "interactionHistory",
      text: [value.summary, value.reason, value.status, value.method]
        .filter(Boolean)
        .join(" · "),
    }));
}
