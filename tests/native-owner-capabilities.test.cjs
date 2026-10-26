const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
const root = path.join(__dirname, "../web/src");
const asModule = (source) =>
  "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const helper = fs
  .readFile(path.join(root, "features/owner-capabilities.js"), "utf8")
  .then(asModule);
async function load(name) {
  let source = await fs.readFile(path.join(root, name), "utf8");
  source = source.replaceAll(
    '"./owner-capabilities"',
    JSON.stringify(await helper),
  );
  return import(asModule(source));
}

test("granular queue capabilities explicitly override legacy owner queue", async () => {
  const { ownerCapability, queueAvailable, queueActionCapability } =
    await import(await helper);
  assert.equal(ownerCapability({ queue: true }, "queue_add"), "queue");
  assert.equal(
    ownerCapability({ queue: true, queue_edit: false }, "queue_edit"),
    "queue_edit",
  );
  assert.equal(
    ownerCapability({ queue: false, queue_add: true }, "queue_add"),
    "queue_add",
  );
  assert.equal(queueAvailable({ queue: false, queue_read: true }), true);
  assert.equal(queueAvailable({ queue: false }), false);
  assert.equal(queueActionCapability("queue", "POST"), "queue_add");
  assert.equal(queueActionCapability("queue/id", "DELETE"), "queue_cancel");
  assert.equal(queueActionCapability("queue/id", "PATCH"), "queue_edit");
  assert.equal(
    queueActionCapability("queue/id/reorder", "POST"),
    "queue_reorder",
  );
  assert.equal(queueActionCapability("queue/resume", "POST"), "queue_resume");
});

test("existing owner guards enforce native granular HTTP actions and legacy fallback", async () => {
  const { createOwners } = await load("features/owners.jsx");
  const state = {
    agentDiscovered: true,
    selected: "s",
    live: {
      owner: {
        state: "connected",
        capabilities: {
          queue: false,
          queue_add: true,
          queue_cancel: true,
          queue_reorder: true,
          queue_edit: false,
          queue_resume: false,
          plan: true,
        },
      },
    },
    running: true,
    currentRequests: [],
    queue: [],
  };
  const owners = createOwners({ state });
  assert.equal(owners.ownerCan("queue_add"), true);
  assert.equal(owners.ownerCan("queue_edit"), false);
  assert.equal(owners.actionCapability("threads/s/queue", "POST"), "queue_add");
  assert.equal(
    owners.actionCapability("threads/s/queue/id", "DELETE"),
    "queue_cancel",
  );
  assert.equal(
    owners.actionCapability("threads/s/queue/id/reorder", "POST"),
    "queue_reorder",
  );
  assert.equal(
    owners.actionCapability("attachments?project=x", "POST"),
    "queue_add",
  );
  assert.equal(
    owners.actionCapability("threads/s/revise-plan", "POST"),
    "plan",
  );
  state.live.owner.capabilities = { queue: true };
  assert.equal(owners.ownerCan("queue_edit"), true);
  state.live.owner.state = "observing";
  assert.equal(owners.ownerCan("queue_add"), false);
});

test("connected native owner remains available while send is disabled", async () => {
  const { createOwners } = await load("features/owners.jsx");
  const state = {
    agentDiscovered: true,
    selected: "s",
    session: { source: "desktop" },
    currentRequests: [],
    live: {
      owner: {
        kind: "native",
        state: "connected",
        capabilities: { send: false, queue_add: true, answer: true },
      },
    },
  };
  const nodes = new Map();
  const $ = (id) => {
    if (!nodes.has(id)) nodes.set(id, {});
    return nodes.get(id);
  };
  const owners = createOwners({
    state,
    $,
    t: (text) => text,
    getAgent: () => ({ sourceLabel: (source) => source }),
    closeReasoning: () => {},
  });
  owners.renderOwner();
  assert.equal(owners.ownerCan("send"), false);
  assert.equal(owners.ownerCan("queue_add"), true);
  assert.equal(owners.ownerCan("answer"), true);
  assert.equal(
    $("ownerNotice").textContent,
    "Connected to the original application.",
  );
  assert.equal($("ownerBanner").hidden, false);
  for (const ownerState of ["observing", "uncertain"]) {
    state.live.owner.state = ownerState;
    owners.renderOwner();
    assert.match($("ownerNotice").textContent, /unavailable/);
    assert.equal(owners.ownerCan("queue_add"), false);
  }
  state.live.owner.state = "connected";
  state.device = { online: false };
  owners.renderOwner();
  assert.match($("ownerNotice").textContent, /unavailable/);
  state.device.online = true;
  state.archivedSelection = true;
  owners.renderOwner();
  assert.match($("ownerNotice").textContent, /archived/);
  state.archivedSelection = false;
  state.session.source = "remote";
  state.live.owner = undefined;
  owners.renderOwner();
  assert.equal($("ownerBanner").hidden, true);
  assert.equal(owners.ownerCan("send"), true);
});

test("composer can enqueue with generic queue disabled and retains native request UUID", async () => {
  const { createComposer } = await load("features/composer.jsx");
  global.crypto ||= webcrypto;
  const state = {
    selected: "s",
    project: "/project",
    running: true,
    currentRequests: [],
    queue: [],
    attachments: [],
    skills: [],
    mentions: [],
    tools: [],
    prefs: {},
    catalog: { capabilities: { queue: false, queue_add: true } },
    generation: 1,
    liveRevision: 0,
    live: {},
    uploading: 0,
  };
  const message = { value: "native queue" },
    calls = [],
    required = [];
  const composer = createComposer({
    $: () => message,
    state,
    nativeSettings: () => true,
    shouldQueue: () => true,
    requireOwner: (c) => required.push(c),
    ownerEpoch: () => "epoch",
    updateControls: () => {},
    renderCurrent: () => {},
    notice: () => {},
    resetQueue: () => {},
    detail: async () => {},
    ensureStream: () => {},
    api: async (path, body) => {
      calls.push({ path, body });
      return { queue: [] };
    },
    applyQueue: () => {},
    clearDraft: () => {
      message.value = "";
    },
    refreshQueue: async () => {},
    list: async () => {},
  });
  await composer.submit();
  assert.deepEqual(required, ["queue_add"]);
  assert.equal(calls[0].path, "threads/s/queue");
  assert.match(calls[0].body.request_id, /^[a-f0-9-]{36}$/);
  assert.equal(calls[0].body.text, "native queue");
  assert.equal(message.value, "");
});

test("native pending plan allows original approval while running and never turns revision into send", async () => {
  const { nativePendingPlan, planBlockedWhileRunning, planRevisionRequest } =
    await import(await helper);
  const state = {
    running: true,
    pendingPlan: { id: "pending:hash" },
    live: { pending_plan_approval: true, pending_plan: { id: "pending:hash" } },
  };
  assert.equal(nativePendingPlan(state), true);
  assert.equal(planBlockedWhileRunning(state), false);
  assert.deepEqual(planRevisionRequest(state, "adjust", { text: "new task" }), {
    action: "revise-plan",
    payload: { plan_id: "pending:hash", feedback: "adjust" },
  });
  state.live.pending_plan.id = "changed";
  assert.equal(planBlockedWhileRunning(state), true);
  assert.throws(() => planRevisionRequest(state, "adjust", {}), /plan changed/);
  state.live = {};
  assert.equal(planBlockedWhileRunning(state), true);
  state.running = false;
  assert.equal(planBlockedWhileRunning(state), false);
  assert.deepEqual(
    planRevisionRequest(state, "adjust", { text: "old behavior" }),
    { action: "turn", payload: { text: "old behavior" } },
  );
});

test("native queue controls keep original IDs, granular permissions, and unknown rows", async () => {
  const ts = require("typescript"),
    vm = require("node:vm");
  const source = await fs.readFile(
    path.join(root, "features/queue.jsx"),
    "utf8",
  );
  const helperModule = await import(await helper);
  const module = { exports: {} },
    nodes = new Map(),
    requests = [],
    required = [];
  let rendered;
  const element = (type, props, ...children) => ({
    type,
    props: {
      ...props,
      children: children.length === 1 ? children[0] : children,
    },
  });
  const context = {
    module,
    exports: module.exports,
    React: { createElement: element },
    AbortController,
    require: (name) => {
      if (name === "./owner-capabilities") return helperModule;
      if (name === "../render")
        return {
          renderView: (_node, view) => {
            rendered = view;
          },
        };
      return new Proxy({}, { get: (_target, key) => key });
    },
  };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
      },
    }).outputText,
    context,
  );
  const state = {
    selected: "s",
    generation: 1,
    running: true,
    currentRequests: [],
    queue: [],
    queueRevision: -1,
    queueOwnerEpoch: "e",
    live: {
      owner: {
        kind: "native",
        capabilities: {
          queue: false,
          queue_add: true,
          queue_cancel: true,
          queue_reorder: true,
          queue_edit: false,
          queue_resume: false,
          steer: false,
        },
      },
    },
    catalog: { capabilities: { queue: false, queue_add: true } },
    device: { online: true },
  };
  const $ = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        dataset: {},
        hidden: false,
        textContent: "",
        open: false,
      });
    return nodes.get(id);
  };
  const queue = module.exports.createQueue({
    state,
    $,
    ownerEpoch: () => "e",
    api: async (path, body) => {
      requests.push({ path, body });
      return {
        queue: [
          { id: "b", text: "second", status: "waiting" },
          { id: "a", text: "first", status: "waiting" },
        ],
        revision: 2,
        known: true,
      };
    },
    updateControls: () => {},
    t: (s) => s,
    projectName: (s) => s,
    ownerCan: (key) => state.live.owner.capabilities[key] === true,
    getLanguage: () => "en",
    Action: "Action",
    requireOwner: (key) => required.push(key),
    detail: async () => {},
  });
  queue.applyQueue({
    queue: [
      { id: "a", text: "first", status: "waiting" },
      { id: "b", text: "second", status: "waiting" },
    ],
    revision: 1,
    known: true,
  });
  const all = [];
  function walk(node) {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      all.push(node);
      walk(node.props?.children);
    }
  }
  walk(rendered);
  const down = all.find(
    (node) =>
      node.props?.className === "icon-button queue-reorder" &&
      node.props["aria-label"] === "Move queued message down" &&
      !node.props.disabled,
  );
  assert(down);
  assert(
    all
      .filter((node) => node.props?.className === "icon-button queue-edit")
      .every((node) => node.props.disabled),
  );
  assert(
    all
      .filter((node) => node.props?.className === "queue-steer")
      .every((node) => node.props.disabled),
  );
  await down.props.action();
  assert.deepEqual(required, ["queue_reorder"]);
  assert.equal(requests[0].path, "threads/s/queue/a/reorder");
  assert.equal(requests[0].body.over, "b");
  assert.deepEqual(
    Array.from(state.queue, (entry) => entry.id),
    ["b", "a"],
  );
  queue.applyLiveQueue({ queue_known: false, queue_error: "Reconnecting" });
  assert.deepEqual(
    Array.from(state.queue, (entry) => entry.id),
    ["b", "a"],
  );
  assert.equal(state.queuePaused, true);
  assert.equal(state.queueError, "Reconnecting");
  queue.applyLiveQueue({
    queue: [{ id: "current", text: "current", status: "waiting" }],
    queue_revision: 11,
    queue_paused: false,
  });
  queue.applyQueue({
    known: false,
    revision: 10,
    error: "Old reconciliation failure",
  });
  assert.equal(state.queueRevision, 11);
  assert.equal(state.queuePaused, false);
  assert.equal(state.queueError, "");
  queue.applyLiveQueue({
    queue_known: false,
    queue_revision: 12,
    queue_error: "New reconciliation",
  });
  queue.applyQueue({
    queue: [{ id: "stale", text: "stale", status: "waiting" }],
    revision: 11,
    paused: false,
  });
  assert.equal(state.queueRevision, 12);
  assert.equal(state.queuePaused, true);
  assert.equal(state.queueError, "New reconciliation");
  assert.deepEqual(
    Array.from(state.queue, (entry) => entry.id),
    ["current"],
  );
});

test("native pending plan actions run while suspended and reply to the original approval", async () => {
  const ts = require("typescript"),
    vm = require("node:vm");
  const source = await fs.readFile(
      path.join(root, "features/workspace.jsx"),
      "utf8",
    ),
    helperModule = await import(await helper);
  const module = { exports: {} },
    nodes = new Map(),
    requests = [];
  const context = {
    module,
    exports: module.exports,
    React: { createElement: () => null },
    clearTimeout,
    require: (name) =>
      name === "./owner-capabilities"
        ? helperModule
        : new Proxy({}, { get: () => () => null }),
  };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
      },
    }).outputText,
    context,
  );
  const $ = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        dataset: {},
        hidden: false,
        textContent: "",
        value: "",
        open: false,
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
        focus() {},
      });
    return nodes.get(id);
  };
  const state = {
    selected: "s",
    generation: 1,
    running: true,
    live: {
      pending_plan_approval: true,
      pending_plan: { id: "p:hash", text: "native plan" },
    },
    prefs: { model: "native-model", permission: "plan" },
  };
  const workspace = module.exports.createWorkspace({
    state,
    $,
    t: (s) => s,
    ownerCan: (key) => key === "plan",
    ownerEpoch: () => "e",
    requireOwner: () => {},
    nativeSettings: () => true,
    updateControls: () => {},
    detail: async () => {},
    ensureStream: () => {},
    permissionLabel: () => "plan",
    api: async (path, body) => {
      requests.push({ path, body });
      return {};
    },
  });
  await workspace.refreshPendingPlan();
  assert.equal(state.pendingPlan.id, "p:hash");
  assert.equal($("planAction").hidden, false);
  workspace.requestPlanRevision();
  assert.equal($("revisePlanDialog").open, true);
  $("planFeedback").value = "revise";
  await workspace.revisePendingPlan();
  assert.equal(requests[0].path, "threads/s/revise-plan");
  assert.equal(requests[0].body.plan_id, "p:hash");
  assert.equal(requests[0].body.feedback, "revise");
  assert.equal(requests[0].body.text, undefined);
  await workspace.refreshPendingPlan();
  workspace.requestPlanExecution();
  assert.equal($("executePlanDialog").open, true);
  await workspace.executePendingPlan();
  assert.equal(requests[1].path, "threads/s/execute-plan");
  assert.equal(requests[1].body.plan_id, "p:hash");
  assert.equal(requests[1].body.model, "native-model");
});

test("independent Agent state gates only that slot and pending recovery waits for confirmed detail", async () => {
  const { createOwners } = await load("features/owners.jsx");
  let agent = "claude-desktop";
  const state = {
    agentDiscovered: true,
    selected: "original",
    agents: [
      { id: agent, state: "unavailable" },
      { id: "codex", state: "connected" },
    ],
    live: { owner: { state: "connected", capabilities: { send: true } } },
  };
  const owners = createOwners({ state, getAgent: () => ({ id: agent }) });
  assert.equal(owners.ownerCan("send"), false);
  agent = "codex";
  assert.equal(owners.ownerCan("send"), true);
  state.agentReadPending = true;
  assert.equal(owners.ownerCan("send"), false);
  state.agentReadPending = false;
  agent = "claude-desktop";
  delete state.agents[0].state;
  assert.equal(owners.ownerCan("send"), true);
});
