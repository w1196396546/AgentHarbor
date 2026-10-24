import { renderView, clearView } from "../render";
import { createConversation } from "./conversation";
import { createMarkdown } from "./markdown";
import { RemoteIcon as Icon } from "../components/RemoteIcon";
import { Button } from "../components/ui/button";
import { createReadIndexes } from "./indexes";
import { agentTree, mergeAgentGraph } from "./agent-graph";

export function createSubagents({
  state,
  $,
  t,
  api,
  getAgent,
  run,
  Action,
  projectName,
  onAgentsChanged,
  jumpToItem,
  getRenderKey = () => document.documentElement.lang,
}) {
  const { markdown } = createMarkdown({
    t,
    run,
    Action,
    readOnly: true,
    getRenderKey: () => getRenderKey() + "|" + selected,
  });
  const { renderItems, legacyItems, mergeOrdered } = createConversation({
    t,
    Action,
    getAgent,
    markdown,
    projectName,
    getScope: () => scope + "|" + selected,
    getAllItems: () => items,
    readOnly: true,
  });
  let scope = "",
    token = "",
    agents = [],
    selected = "",
    items = [],
    cursor = "",
    anchor = "",
    detailSeq = 0,
    listSeq = 0,
    loadingList = false,
    loadingDetail = false,
    listError = "",
    detailError = "",
    timer = null,
    pending = false,
    controller = null,
    paged = false;
  let graphAgents = [],
    graphCut = false,
    graphMergedItems = null,
    graphReset = false;
  const graph = createReadIndexes({
    state,
    getAgent,
    api,
    onChange: () => {
      const page = graphPage();
      if (!page.loading && page.loaded && page.items !== graphMergedItems) {
        const merged = mergeAgentGraph(
          graphReset ? [] : graphAgents,
          page.items,
        );
        graphAgents = merged.agents;
        graphCut = (!graphReset && graphCut) || merged.truncated;
        graphReset = false;
        graphMergedItems = page.items;
        if (state.catalog.capabilities?.subagents !== true)
          agents = graphAgents;
      }
      render();
    },
  });

  function graphPage() {
    return graph.read("agent_run_graph", "agent-graph", "agents");
  }
  function loadGraph(more = false) {
    if (!more && !graphPage().loading) graphReset = true;
    return graph.load(
      "agent_run_graph",
      "agent-graph",
      "agents",
      undefined,
      more,
    );
  }

  function currentScope() {
    return state.selected &&
      (state.catalog.capabilities?.subagents === true ||
        graph.supports("agent_run_graph"))
      ? [
          window.RemoteSecure?.deviceID?.() || state.device?.id || "",
          getAgent().id,
          state.selected,
          state.generation,
          state.live?.owner?.epoch,
        ].join("|")
      : "";
  }
  function agentName(agent) {
    return agent.name || agent.role || agent.id;
  }
  function statusLabel(status) {
    return t(
      {
        pending: "Pending",
        pendingInit: "Pending",
        starting: "Running",
        inProgress: "Running",
        running: "Running",
        waiting: "Waiting for you",
        idle: "Ready",
        completed: "Completed",
        failed: "Failed",
        errored: "Failed",
        interrupted: "Interrupted",
        shutdown: "Stopped",
        closed: "Stopped",
        notFound: "Unavailable",
      }[status] || "Status unknown",
    );
  }
  function operationLabel(item) {
    return t(
      {
        spawnAgent: "Create agent",
        sendInput: "Send to agent",
        wait: "Wait for agents",
        closeAgent: "Close agent",
        resumeAgent: "Resume agent",
      }[item.data?.tool] ||
        item.data?.tool ||
        "Agent",
    );
  }
  function agentOperations(calls, id) {
    return calls.filter((item) => {
      const data = item.data || {};
      return (
        (Array.isArray(data.receiverThreadIds) &&
          data.receiverThreadIds.includes(id)) ||
        (Array.isArray(data.receiverThreads) &&
          data.receiverThreads.some(
            (agent) => (agent.threadId || agent.id) === id,
          )) ||
        Object.hasOwn(data.agentsStates || {}, id)
      );
    });
  }
  function showOperation(id) {
    if (!scope || scope !== currentScope() || !jumpToItem) return;
    $("subagentsDialog").close();
    jumpToItem(id);
  }
  function Overview({ agent, calls, detail = false }) {
    const indexed = graph.supports("agent_run_graph")
        ? graphAgents.find((value) => value.id === agent.id)
        : null,
      observed = agentOperations(calls, agent.id),
      operations =
        indexed && Array.isArray(indexed.operations)
          ? indexed.operations.map((operation) => ({
              ...operation,
              data: { tool: operation.operation },
            }))
          : observed,
      creation = observed.find((item) => item.data?.tool === "spawnAgent"),
      task = indexed?.task || creation?.data?.prompt,
      parentID =
        indexed?.parent_id || agent.parent_id || creation?.data?.senderThreadId,
      parent = agents.find((value) => value.id === parentID),
      latest = indexed?.latest_operation
        ? {
            ...indexed.latest_operation,
            data: { tool: indexed.latest_operation.operation },
          }
        : operations.at(-1),
      result =
        indexed?.result_summary ||
        observed
          .map((item) => item.data?.agentsStates?.[agent.id]?.message)
          .reverse()
          .find((value) => typeof value === "string" && value.trim()),
      lastActivity = indexed?.last_activity_at_ms,
      reply = detail
        ? items
            .filter((item) => item.type === "agentMessage")
            .map((item) => item.text || item.data?.text)
            .reverse()
            .find((value) => typeof value === "string" && value.trim())
        : "";
    return (
      <section className="subagent-overview">
        {detail ? (
          <p className="note">
            {agentName(agent)} · {statusLabel(agent.status)}
          </p>
        ) : (
          <Button
            variant="ghost"
            type="button"
            className="subagent-row"
            data-agent-id={agent.id}
            data-status={agent.status}
            disabled={state.catalog.capabilities?.subagents !== true}
            onClick={() => openAgent(agent.id)}
          >
            <Icon name="agent" />
            <span className="subagent-name">{agentName(agent)}</span>
            <span className="subagent-status">{statusLabel(agent.status)}</span>
            <Icon name="chevron" />
          </Button>
        )}
        {parentID && (
          <p className="note">
            {t("Parent agent")}:{" "}
            {parent
              ? agentName(parent)
              : parentID === state.selected
                ? state.session?.title || t("Parent conversation")
                : parentID}
          </p>
        )}
        {typeof task === "string" && task.trim() && (
          <details className="raw-details">
            <summary>{t("Agent task")}</summary>
            <div className="tool-text">{markdown(task)}</div>
          </details>
        )}
        {latest && (
          <p className="note">
            {t("Last observed operation")}: {operationLabel(latest)} ·{" "}
            {statusLabel(latest.status)}
          </p>
        )}
        {Number.isFinite(lastActivity) &&
          lastActivity > 0 &&
          lastActivity <= 8640000000000000 && (
            <p className="note">
              {t("Last activity")}:{" "}
              <time dateTime={new Date(lastActivity).toISOString()}>
                {new Date(lastActivity).toLocaleString()}
              </time>
            </p>
          )}
        {result && result !== reply && (
          <details className="raw-details">
            <summary>{t("Result summary")}</summary>
            <div className="tool-text">{markdown(result)}</div>
          </details>
        )}
        {reply && (
          <p className="tool-text">
            <strong>{t("Latest loaded reply")}: </strong>
            {reply}
          </p>
        )}
        {!!operations.length && (
          <details className="raw-details">
            <summary>
              {t(
                indexed
                  ? "Historical agent operations"
                  : "Loaded agent operations",
              )}{" "}
              ({operations.length})
            </summary>
            <ol>
              {operations.map((item) => (
                <li key={item.id}>
                  {jumpToItem &&
                  (!indexed ||
                    (item.item_id && item.thread_id === state.selected)) ? (
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => showOperation(item.item_id || item.id)}
                      title={t("Show original record")}
                    >
                      {operationLabel(item)} · {statusLabel(item.status)}
                    </Button>
                  ) : (
                    <span>
                      {operationLabel(item)} · {statusLabel(item.status)}
                    </span>
                  )}
                  {item.summary && <p className="tool-text">{item.summary}</p>}
                  {item.result_summary && (
                    <p className="tool-text">{item.result_summary}</p>
                  )}
                </li>
              ))}
            </ol>
          </details>
        )}
      </section>
    );
  }
  function AgentBranch({ node, calls }) {
    return (
      <li>
        <Overview agent={node.agent} calls={calls} />
        {!!node.children.length && (
          <ul>
            {node.children.map((child) => (
              <AgentBranch key={child.agent.id} node={child} calls={calls} />
            ))}
          </ul>
        )}
      </li>
    );
  }
  function render() {
    const calls = mergeOrdered(state.history, state.live.items || []).filter(
        (item) => ["collabAgentToolCall", "collabToolCall"].includes(item.type),
      ),
      called = calls.length > 0;
    const page = graphPage(),
      supported = graph.supports("agent_run_graph");
    $("subagentsBar").hidden =
      !scope ||
      (!agents.length &&
        !called &&
        !listError &&
        !(supported && (page.loading || page.error)));
    $("subagentsCount").textContent = agents.length
      ? String(agents.length)
      : "";
    $("subagentsBack").hidden = !selected;
    $("subagentsTitle").textContent = selected
      ? agentName(
          agents.find((agent) => agent.id === selected) || { id: selected },
        )
      : t("Agents");
    $("subagentsList").hidden = false;
    $("subagentConversation").hidden = !selected;
    $("subagentOlder").hidden = !cursor;
    $("subagentOlder").disabled = loadingDetail;
    $("subagentsStatus").textContent = selected
      ? detailError ||
        (loadingDetail && !items.length ? t("Loading conversation…") : "")
      : listError ||
        (loadingList && !agents.length
          ? t("Loading agents…")
          : supported &&
              state.catalog.capabilities?.subagents !== true &&
              (!page.loaded || page.error)
            ? t("Status unknown")
            : !agents.length
              ? t("No agents in this conversation.")
              : "");
    if (selected) renderItems($("subagentMessages"), items);
    renderView(
      $("subagentsList"),
      <>
        {!selected && supported && (
          <div className="agent-graph-status">
            <p className="note" role="status">
              {t("Agent run graph")} ·{" "}
              {t(
                page.loading
                  ? "Loading…"
                  : !page.loaded || page.error
                    ? "Status unknown"
                    : page.scope === "full"
                      ? "Full history"
                      : "Loaded records only",
              )}
              {(graphCut ||
                page.truncated ||
                page.hasMore ||
                page.scope === "loaded") &&
                " · " + t("Results are incomplete")}
            </p>
            {page.error && (
              <p className="note" role="status">
                {t(page.error)}
              </p>
            )}
            {page.error && (
              <Action action={() => loadGraph()}>{t("Retry")}</Action>
            )}
            {page.hasMore && (
              <Action disabled={page.loading} action={() => loadGraph(true)}>
                {t("Load more agent history")}
              </Action>
            )}
          </div>
        )}
        {selected ? (
          agents
            .filter((agent) => agent.id === selected)
            .map((agent) => (
              <Overview key={agent.id} agent={agent} calls={calls} detail />
            ))
        ) : supported ? (
          <ul className="subagent-tree">
            {agentTree(
              agents.map((agent) => ({
                ...agent,
                parent_id:
                  graphAgents.find((value) => value.id === agent.id)
                    ?.parent_id || agent.parent_id,
              })),
            ).map((node) => (
              <AgentBranch key={node.agent.id} node={node} calls={calls} />
            ))}
          </ul>
        ) : (
          agents.map((agent) => (
            <Overview key={agent.id} agent={agent} calls={calls} />
          ))
        )}
      </>,
    );
  }
  function reset() {
    clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
    scope = token = selected = cursor = anchor = listError = detailError = "";
    agents = items = [];
    graph.reset();
    graphAgents = [];
    graphCut = graphReset = false;
    graphMergedItems = null;
    paged = false;
    listSeq++;
    detailSeq++;
    loadingList = loadingDetail = pending = false;
    if ($("subagentsDialog").open) $("subagentsDialog").close();
    clearView($("subagentsList"));
    clearView($("subagentMessages"));
    render();
  }
  function schedule() {
    if (timer) return;
    if (scope && (state.running || $("subagentsDialog").open)) {
      timer = setTimeout(() => {
        timer = null;
        if (document.hidden) schedule();
        else refresh();
      }, 2500);
    }
  }
  async function refresh() {
    if (!scope || scope !== currentScope()) return;
    if (state.catalog.capabilities?.subagents !== true) {
      await loadGraph();
      schedule();
      return;
    }
    if (loadingList) {
      pending = true;
      return;
    }
    clearTimeout(timer);
    timer = null;
    const expected = scope,
      parent = state.selected,
      seq = ++listSeq;
    loadingList = true;
    render();
    try {
      const value = await api(
        "threads/" + encodeURIComponent(parent) + "/agents",
        undefined,
        { observation: true },
      );
      if (scope !== expected || currentScope() !== expected || seq !== listSeq)
        return;
      if (!Array.isArray(value.agents))
        throw new Error(t("Unable to load agents."));
      const changed = JSON.stringify(agents) !== JSON.stringify(value.agents);
      agents = value.agents;
      if (changed) onAgentsChanged?.();
      listError = "";
      if (selected && !agents.some((agent) => agent.id === selected)) back();
    } catch (error) {
      if (scope === expected && currentScope() === expected && seq === listSeq)
        listError = error.message;
    } finally {
      if (
        scope === expected &&
        currentScope() === expected &&
        seq === listSeq
      ) {
        loadingList = false;
        render();
        if (selected && $("subagentsDialog").open && !loadingDetail)
          loadAgent();
        if (pending) {
          pending = false;
          refresh();
        } else schedule();
      }
    }
  }
  async function loadAgent(older = false) {
    if (!selected || !scope || (older && !cursor)) return;
    if (older && loadingDetail) return;
    const expected = scope,
      child = selected,
      seq = ++detailSeq,
      before = cursor;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loadingDetail = true;
    detailError = "";
    render();
    const scroll = $("subagentsDialog"),
      height = scroll.scrollHeight,
      top = scroll.scrollTop;
    try {
      const value = await api(
        "threads/" +
          encodeURIComponent(state.selected) +
          "/agents/" +
          encodeURIComponent(child) +
          (older ? "?" + new URLSearchParams({ cursor: before }) : ""),
        undefined,
        { signal: request.signal, observation: true },
      );
      if (
        scope !== expected ||
        currentScope() !== expected ||
        child !== selected ||
        seq !== detailSeq
      )
        return;
      const native = value.history_items;
      if (!Array.isArray(native) && !Array.isArray(value.history?.parts))
        throw new Error(t("Unable to load this agent conversation."));
      const incoming = Array.isArray(native)
        ? native
        : legacyItems(value.history.parts);
      const gap =
        incoming.length &&
        items.length &&
        !incoming.some((item) => items.some((old) => old.id === item.id));
      items = mergeOrdered(items, incoming, older, older ? anchor : "");
      if (older || !paged || gap) {
        cursor = value.history_next_cursor || "";
        anchor = incoming[0]?.id || anchor;
      }
      if (older) paged = true;
      render();
      if (older) scroll.scrollTop = top + scroll.scrollHeight - height;
      else if (!top || height - top - scroll.clientHeight < 100)
        scroll.scrollTop = scroll.scrollHeight;
      if (value.history_error) detailError = value.history_error;
    } catch (error) {
      if (
        scope === expected &&
        currentScope() === expected &&
        child === selected &&
        seq === detailSeq &&
        error.name !== "AbortError"
      )
        detailError = error.message;
    } finally {
      if (scope === expected && child === selected && seq === detailSeq) {
        loadingDetail = false;
        if (controller === request) controller = null;
        render();
      }
    }
  }
  function openAgent(id) {
    if (
      !scope ||
      scope !== currentScope() ||
      state.catalog.capabilities?.subagents !== true ||
      !agents.some((agent) => agent.id === id)
    )
      return;
    selected = id;
    items = [];
    cursor = anchor = detailError = "";
    paged = false;
    render();
    loadAgent();
  }
  function back() {
    controller?.abort();
    controller = null;
    detailSeq++;
    selected = cursor = anchor = detailError = "";
    items = [];
    paged = false;
    loadingDetail = false;
    render();
  }
  function sync() {
    const next = currentScope();
    if (scope !== next) {
      reset();
      scope = next;
    }
    if (!scope) return;
    const nextToken = [
      scope,
      state.live.turn_id || "",
      state.live.status || "",
      graph.supports("agent_run_graph") ? state.live.items?.length || 0 : "",
    ].join("|");
    if (token !== nextToken) {
      token = nextToken;
      refresh();
      if (state.catalog.capabilities?.subagents === true) void loadGraph();
    }
    render();
    schedule();
  }
  $("subagentsToggle").onclick = () => {
    back();
    $("subagentsDialog").showModal();
    refresh();
    if (state.catalog.capabilities?.subagents === true) void loadGraph();
  };
  $("subagentsBack").onclick = back;
  $("closeSubagents").onclick = () => $("subagentsDialog").close();
  $("subagentOlder").onclick = () => loadAgent(true);
  $("subagentsDialog").addEventListener("close", () => {
    back();
    schedule();
  });
  window.addEventListener("pagehide", reset);
  return {
    syncSubagents: sync,
    resetSubagents: reset,
    getSubagents: () => (scope && scope === currentScope() ? agents : []),
    openSubagent: (id) => {
      if (
        !scope ||
        scope !== currentScope() ||
        !agents.some((agent) => agent.id === id)
      )
        return;
      if (!$("subagentsDialog").open) $("subagentsDialog").showModal();
      openAgent(id);
    },
  };
}
