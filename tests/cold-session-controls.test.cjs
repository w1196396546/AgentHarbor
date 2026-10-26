const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { transformSync } = require("esbuild");

function fixture(capabilities) {
  const paths = { exports: {} };
  vm.runInNewContext(
    transformSync(
      fs.readFileSync(
        path.resolve(__dirname, "../web/src/project-paths.js"),
        "utf8",
      ),
      { format: "cjs" },
    ).code,
    { module: paths },
  );
  const nodes = new Map(),
    rendered = new Map(),
    calls = [],
    events = [],
    inventories = [];
  const $ = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        value: "",
        hidden: true,
        querySelectorAll: () => [],
        setAttribute: () => {},
      });
    return nodes.get(id);
  };
  const state = {
    selected: "",
    project: "",
    listProject: "",
    generation: 1,
    optionsSeq: 0,
    listSeq: 0,
    detailSeq: 0,
    liveRevision: 0,
    catalog: { capabilities: {} },
    optionsLoaded: false,
    sessions: [],
    projects: [],
    attachments: [],
    skills: [],
    mentions: [],
    tools: [],
    prefs: {},
    live: {},
    currentRequests: [],
  };
  const module = { exports: {} },
    jsx = (type, props) => ({ type, props });
  vm.runInNewContext(
    transformSync(
      fs.readFileSync(
        path.resolve(__dirname, "../web/src/features/sessions.jsx"),
        "utf8",
      ),
      { loader: "jsx", format: "cjs", jsx: "automatic" },
    ).code,
    {
      module,
      URLSearchParams,
      clearTimeout,
      document: { body: { classList: { toggle: () => {} } } },
      require: (name) =>
        name === "../project-paths"
          ? paths.exports
          : name === "react/jsx-runtime"
            ? { jsx, jsxs: jsx, Fragment: "fragment" }
            : name === "../render"
              ? {
                  renderView: (node, value) => rendered.set(node, value),
                  clearView: () => {},
                }
              : {},
    },
  );
  let releaseHistory;
  const history = new Promise((resolve) => {
    releaseHistory = resolve;
  });
  const nativeRow = {
    id: "cold-thread",
    title: "Cold native thread",
    source: "codex-app",
    cwd: "/project",
    last: "2026-10-26T00:00:00Z",
  };
  const complete = {
    models: [],
    skills: [],
    tools: [],
    capabilities: { controls_options: true, connection_metadata: true },
  };
  const sessions = module.exports.createSessions({
    state,
    $,
    t: (text) => text,
    getAgent: () => ({ id: "codex" }),
    getLanguage: () => "en",
    sourceLabel: (value) => value,
    run: (action) => action(),
    api: async (request) => {
      calls.push(request);
      if (request.startsWith("sessions?"))
        return {
          sessions: [nativeRow],
          projects: ["/project"],
          next: 1,
          has_more: false,
          capabilities,
        };
      if (
        new URLSearchParams(request.split("?")[1]).get("scope") === "controls"
      )
        return {
          models: [],
          capabilities: { controls_options: true, connection_metadata: true },
        };
      if (capabilities?.controls_options === true)
        return new Promise((resolve) =>
          inventories.push(() => resolve(complete)),
        );
      return complete;
    },
    closeStream: () => {},
    resetSideData: () => {},
    closeDialog: () => {},
    updateControls: () => {},
    renderAttachments: () => {},
    hideSuggestions: () => {},
    resizeComposer: () => {},
    renderRequests: () => {},
    ensureStream: () => {},
    refreshQueue: () => {},
    notice: () => {},
    detail: async () => {
      events.push("history");
      await history;
    },
    connectionMetadata: async () => {
      events.push("metadata");
    },
    connectOriginalOwner: async () => {
      events.push("connect");
    },
  });
  const find = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.props?.["data-id"] === nativeRow.id) return node;
    for (const value of Array.isArray(node) ? node : [node.props?.children]) {
      const result = find(value);
      if (result) return result;
    }
  };
  return {
    state,
    calls,
    events,
    sessions,
    select: () =>
      find(rendered.get($("sessions"))).props.onClick({ currentTarget: {} }),
    release: () => {
      releaseHistory();
      inventories.splice(0).forEach((resolve) => resolve());
    },
  };
}

test("cold session list unlocks controls and first owner connection while history and inventory are held", async (t) => {
  const f = fixture({
    controls_options: true,
    connection_metadata: true,
    send: true,
    queue_add: true,
  });
  t.after(f.release);
  const listing = f.sessions.list();
  await new Promise(setImmediate);
  assert.equal(
    new URLSearchParams(f.calls[1].split("?")[1]).get("scope"),
    "controls",
    "first options read waited for full inventory",
  );
  assert.equal(f.state.optionsLoaded, true);
  assert.equal(
    f.state.catalog.capabilities.send,
    undefined,
    "list metadata cannot grant sends",
  );
  assert.equal(
    f.state.catalog.capabilities.queue_add,
    undefined,
    "list metadata cannot grant queue writes",
  );
  await listing;
  const selecting = f.select();
  await new Promise(setImmediate);
  assert.deepEqual(f.events, ["history", "metadata", "connect"]);
  assert.equal(f.state.optionsLoaded, true);
  f.release();
  await selecting;
});

test("legacy or non-boolean list capabilities keep the first full options read", async () => {
  for (const capabilities of [
    undefined,
    {},
    { controls_options: "true", connection_metadata: 1 },
    { controls_options: false, connection_metadata: false },
  ]) {
    const f = fixture(capabilities);
    await f.sessions.list();
    assert.equal(
      new URLSearchParams(f.calls[1].split("?")[1]).has("scope"),
      false,
    );
    assert.equal(f.state.optionsLoaded, true);
    assert.equal(f.calls.length, 2);
    f.release();
  }
});
