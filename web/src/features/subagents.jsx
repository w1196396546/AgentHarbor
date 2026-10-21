import { renderView, clearView } from "../render";
import { createConversation } from "./conversation";
import { createMarkdown } from "./markdown";
import { RemoteIcon as Icon } from "../components/RemoteIcon";
import { Button } from "../components/ui/button";

export function createSubagents({
  state,
  $,
  t,
  api,
  getAgent,
  run,
  Action,
  projectName,
}) {
  const { markdown } = createMarkdown({ t, run, Action, readOnly: true });
  const { renderItems, legacyItems, mergeOrdered } = createConversation({
    t,
    getAgent,
    markdown,
    projectName,
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

  function currentScope() {
    return state.selected && state.catalog.capabilities?.subagents === true
      ? [getAgent().id, state.selected, state.generation].join("|")
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
  function render() {
    const called = [...state.history, ...(state.live.items || [])].some(
      (item) => item.type === "collabAgentToolCall",
    );
    $("subagentsBar").hidden =
      !scope || (!agents.length && !called && !listError);
    $("subagentsCount").textContent = agents.length
      ? String(agents.length)
      : "";
    $("subagentsBack").hidden = !selected;
    $("subagentsTitle").textContent = selected
      ? agentName(
          agents.find((agent) => agent.id === selected) || { id: selected },
        )
      : t("Agents");
    $("subagentsList").hidden = !!selected;
    $("subagentConversation").hidden = !selected;
    $("subagentOlder").hidden = !cursor;
    $("subagentOlder").disabled = loadingDetail;
    $("subagentsStatus").textContent = selected
      ? detailError ||
        (loadingDetail && !items.length ? t("Loading conversation…") : "")
      : listError ||
        (loadingList && !agents.length
          ? t("Loading agents…")
          : !agents.length
            ? t("No agents in this conversation.")
            : "");
    if (selected) renderItems($("subagentMessages"), items);
    else
      renderView(
        $("subagentsList"),
        agents.map((agent) => (
          <Button
            key={agent.id}
            variant="ghost"
            type="button"
            className="subagent-row"
            data-agent-id={agent.id}
            data-status={agent.status}
            onClick={() => openAgent(agent.id)}
          >
            <Icon name="agent" />
            <span className="subagent-name">{agentName(agent)}</span>
            <span className="subagent-status">{statusLabel(agent.status)}</span>
            <Icon name="chevron" />
          </Button>
        )),
      );
  }
  function reset() {
    clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
    scope = token = selected = cursor = anchor = listError = detailError = "";
    agents = items = [];
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
      agents = value.agents;
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
    ].join("|");
    if (token !== nextToken) {
      token = nextToken;
      refresh();
    }
    render();
    schedule();
  }
  $("subagentsToggle").onclick = () => {
    back();
    $("subagentsDialog").showModal();
    refresh();
  };
  $("subagentsBack").onclick = back;
  $("closeSubagents").onclick = () => $("subagentsDialog").close();
  $("subagentOlder").onclick = () => loadAgent(true);
  $("subagentsDialog").addEventListener("close", () => {
    back();
    schedule();
  });
  window.addEventListener("pagehide", reset);
  return { syncSubagents: sync, resetSubagents: reset };
}
