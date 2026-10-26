const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { transformSync } = require("esbuild");

function deferred() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function fixture(metadata) {
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
    events = [],
    history = deferred(),
    connected = deferred(),
    state = {
      selected: "",
      generation: 1,
      optionsSeq: 0,
      detailSeq: 0,
      liveRevision: 0,
      sessions: [
        {
          id: "thread",
          title: "Native thread",
          source: "codex-app",
          cwd: "/worktree/shop",
          project_id: "native-shop",
        },
      ],
      projects: ["/project/shop"],
      sidebarProjects: [
        {
          id: "native-shop",
          name: "Shop",
          root_paths: ["/project/shop", "/worktree/shop"],
        },
      ],
      pinnedIDs: [],
      attachments: [],
      skills: [],
      mentions: [],
      tools: [],
      prefs: {},
      live: {},
      currentRequests: [],
      catalog: { capabilities: { connection_metadata: metadata } },
    };
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
  const sessions = module.exports.createSessions({
    state,
    $,
    t: (text) => text,
    getAgent: () => ({ id: "codex" }),
    getLanguage: () => "en",
    sourceLabel: (value) => value,
    run: (action) => action(),
    api: async () => ({
      agent: { id: "codex" },
      capabilities: { connection_metadata: metadata },
    }),
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
    detail: async () => {
      events.push("history");
      await history.promise;
    },
    connectionMetadata: async () => {
      events.push("metadata");
    },
    connectOriginalOwner: async () => {
      events.push("connect");
      connected.resolve();
    },
  });
  sessions.renderSessions();
  const find = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.props?.["data-id"] === "thread") return node;
    for (const value of Array.isArray(node) ? node : [node.props?.children]) {
      const result = find(value);
      if (result) return result;
    }
  };
  const row = find(rendered.get($("sessions")));
  assert(row, "rendered history row is missing");
  return {
    state,
    events,
    history,
    connected,
    select: () => row.props.onClick({ currentTarget: {} }),
  };
}

test("advertised connection metadata connects while full history is held and preserves its native project", async () => {
  const f = fixture(true),
    selecting = f.select();
  await new Promise(setImmediate);
  assert.deepEqual(f.events, ["history", "metadata", "connect"]);
  assert.equal(f.state.project, "/project/shop");
  f.history.resolve();
  await selecting;
});

test("older clients still confirm full detail before connecting", async () => {
  const f = fixture(false),
    selecting = f.select();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(f.events, ["history"]);
  f.history.resolve();
  await selecting;
  assert.deepEqual(f.events, ["history", "connect"]);
});
