export function agentTree(agents) {
  const byID = new Map(agents.map((agent) => [agent.id, agent])),
    seen = new Set();
  function branch(agent, depth) {
    if (seen.has(agent.id)) return null;
    seen.add(agent.id);
    return {
      agent,
      depth,
      children:
        depth < 32
          ? agents
              .filter((child) => child.parent_id === agent.id)
              .map((child) => branch(child, depth + 1))
              .filter(Boolean)
          : [],
    };
  }
  const roots = agents
    .filter((agent) => !byID.has(agent.parent_id))
    .map((agent) => branch(agent, 0));
  for (const agent of agents)
    if (!seen.has(agent.id)) roots.push(branch(agent, 0));
  return roots.filter(Boolean);
}

export function mergeAgentGraph(existing, incoming, limit = 5000) {
  const nodes = new Map(existing.map((agent) => [agent.id, agent]));
  let count = existing.reduce(
      (sum, agent) => sum + (agent.operations?.length || 0),
      0,
    ),
    truncated = false;
  for (const value of incoming) {
    const previous = nodes.get(value.id),
      operations = new Map(
        (previous?.operations || []).map((operation) => [
          operation.id,
          operation,
        ]),
      );
    for (const operation of Array.isArray(value.operations)
      ? value.operations
      : []) {
      if (!operation || typeof operation.id !== "string" || !operation.id)
        continue;
      if (!operations.has(operation.id)) {
        if (count >= limit) {
          truncated = true;
          continue;
        }
        count++;
      }
      operations.set(operation.id, operation);
    }
    const merged = {
      ...previous,
      ...value,
      operations: [...operations.values()],
    };
    for (const key of ["task", "result_summary", "last_activity_at_ms"])
      if (value[key] == null || value[key] === "")
        merged[key] = previous?.[key];
    if (previous?.latest_operation)
      merged.latest_operation = previous.latest_operation;
    if (previous?.result_summary)
      merged.result_summary = previous.result_summary;
    nodes.set(value.id, merged);
  }
  return { agents: [...nodes.values()], truncated };
}
