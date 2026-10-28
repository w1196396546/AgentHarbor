const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { webcrypto } = require("node:crypto");
const root = path.join(__dirname, "../web/src");
const moduleURL = (source) =>
  "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const helperPromise = fs
  .readFile(path.join(root, "features/creation-requests.js"), "utf8")
  .then((source) => import(moduleURL(source)));
const storage = () => {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    data,
  };
};

async function fixture() {
  const helper = await helperPromise;
  const source = await fs.readFile(
    path.join(root, "features/sessions.jsx"),
    "utf8",
  );
  const nodes = new Map(),
    sessionStorage = storage(),
    calls = [];
  const state = {
    generation: 1,
    optionsSeq: 1,
    project: "/project",
    selected: "",
    device: { id: "device" },
    prefs: { model: "model", mode: "default", permission: "default" },
    sidebarProjects: [],
    listSeq: 0,
    sessions: [],
    projects: ["/project"],
  };
  const context = {
    exports: {},
    React: require("react"),
    sessionStorage,
    crypto: webcrypto,
    URLSearchParams,
    clearTimeout,
    Date,
    Map,
    Set,
    Object,
    console,
    require: (name) => {
      if (name === "./creation-requests") return helper;
      return new Proxy(
        { renderView: () => {}, clearView: () => {} },
        { get: (t, k) => t[k] || (() => {}) },
      );
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
  let respond = async () => ({
    id: "created",
    cwd: "/project",
    source: "claude-desktop",
  });
  const catalog = {
    agent: { id: "claude-desktop" },
    capabilities: {
      background_creation: true,
      creation_request_id: true,
      creation_default_permissions_only: true,
    },
  };
  const session = context.exports.createSessions({
    state,
    $: (id) => {
      if (!nodes.has(id)) nodes.set(id, { hidden: false, value: "draft", querySelectorAll: () => [] });
      return nodes.get(id);
    },
    getAgent: () => ({ id: "claude-desktop", sourceID: "claude-desktop" }),
    t: (value) => value,
    getLanguage: () => "en",
    sourceLabel: (value) => value,
    api: async (p, b) => {
      if (p.startsWith("options?")) return catalog;
      calls.push(JSON.parse(JSON.stringify(b)));
      return respond(p, b);
    },
    updateControls: () => {},
    closeStream: () => {},
    resetSideData: () => {},
    closeDialog: () => {},
    detail: async () => {},
    renderAttachments: () => {},
    hideSuggestions: () => {},
    resizeComposer: () => {},
  });
  return {
    state,
    session,
    sessionStorage,
    calls,
    catalog,
    nodes,
    setRespond: (f) => (respond = f),
  };
}

test("creation reservations survive reload and isolate device agent project", async () => {
  global.crypto ||= webcrypto;
  const { createCreationRequests } = await helperPromise,
    s = storage(),
    requests = createCreationRequests(s),
    scope = ["device", "claude-desktop", "/project"];
  const first = requests.reserve(scope, { project: "/project" });
  assert.equal(
    createCreationRequests(s).reserve(scope, { project: "/project" })
      .request_id,
    first.request_id,
  );
  for (const foreign of [
    ["other", "claude-desktop", "/project"],
    ["device", "codex", "/project"],
    ["device", "claude-desktop", "/other"],
  ])
    assert.notEqual(requests.reserve(foreign, {}).request_id, first.request_id);
  assert.throws(
    () => requests.reserve(scope, { model: "changed" }),
    /previous creation is unconfirmed/,
  );
  requests.confirm(scope, first.request_id, "local_original");
  assert.equal(requests.reserve(scope, { model: "new" }).id, "local_original");
});

test("creation fails before a write when browser receipt storage is unavailable", async () => {
  global.crypto ||= webcrypto;
  const { createCreationRequests } = await helperPromise;
  assert.throws(
    () =>
      createCreationRequests({
        getItem: () => null,
        setItem: () => {
          throw Error("quota");
        },
      }).reserve(["d", "a", "p"], {}),
    /Unable to preserve/,
  );
});

test("actual createThread reuses uncertain request UUID and sends default creation options", async () => {
  const f = await fixture();
  let fail = true;
  f.setRespond(async () => {
    if (fail) {
      fail = false;
      throw Error("response lost");
    }
    return { id: "created", cwd: "/project" };
  });
  await assert.rejects(f.session.createThread(), /response lost/);
  await f.session.createThread();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].request_id, f.calls[1].request_id);
  assert.match(f.calls[0].request_id, /^[a-f0-9-]{36}$/);
  assert.equal(f.calls[0].mode, undefined);
  assert.equal(f.calls[0].permission, undefined);
  assert.equal(f.calls[0].model, "model");
});

test("projectless creation requires capability and keeps an uncertain UUID separate from project drafts", async () => {
  const f = await fixture();
  f.state.project = "";
  f.state.projectless = true;
  await assert.rejects(f.session.createThread(), /updated agentTools/);
  assert.equal(f.calls.length, 0);
  f.catalog.capabilities.projectless_creation = true;
  f.setRespond(async () => { throw Error("response lost"); });
  await assert.rejects(f.session.createThread(), /response lost/);
  const requestID = f.calls[0].request_id;
  f.setRespond(async () => ({ id: "outside", cwd: "/managed/working", projectless: true }));
  const row = await f.session.createThread();
  assert.equal(row.cwd, "/managed/working");
  assert.equal(row.projectless, true);
  assert.equal(f.calls[1].request_id, requestID);
  assert.equal(f.calls[1].project, "");
  assert.equal(f.calls[1].projectless, true);
});

test("nondefault mode and permissions preserve draft and reject before creation", async () => {
  for (const prefs of [{ mode: "plan" }, { permission: "bypassPermissions" }]) {
    const f = await fixture();
    f.state.prefs = prefs;
    await assert.rejects(f.session.createThread(), /Create with default mode/);
    assert.equal(f.calls.length, 0);
    assert.deepEqual(f.state.prefs, prefs);
  }
});

test("creation uses declared Auto permission and preserves explicit Manual", async () => {
  for (const permission of [undefined, "default", "auto"]) {
    const f = await fixture();
    f.catalog.capabilities.creation_default_permissions_only = false;
    f.catalog.creation_default_permission = "auto";
    f.catalog.creation_permissions = ["auto", "default"];
    f.state.prefs = permission ? { permission } : {};
    await f.session.createThread();
    assert.equal(f.calls[0].permission, permission || "auto");
  }
});

test("creation rejects unsupported permission or plan without changing the draft", async () => {
  for (const prefs of [{ permission: "bypassPermissions" }, { mode: "plan" }]) {
    const f = await fixture();
    f.catalog.capabilities.creation_default_permissions_only = false;
    f.catalog.creation_default_permission = "auto";
    f.catalog.creation_permissions = ["auto", "default"];
    f.state.prefs = prefs;
    await assert.rejects(f.session.createThread(), /unavailable when creating/);
    assert.equal(f.calls.length, 0);
    assert.deepEqual(f.state.prefs, prefs);
    assert.equal(f.sessionStorage.length, 0);
  }
});

test("late creation from another device is saved only under its original scope and never auto repeated", async () => {
  const f = await fixture();
  f.setRespond(async () => {
    f.state.device = { id: "other" };
    return { id: "original", cwd: "/project" };
  });
  await assert.rejects(f.session.createThread(), /Connection failed/);
  assert.equal(f.state.selected, "");
  assert.equal(f.calls.length, 1);
  f.state.device = { id: "device" };
  f.setRespond(async () => {
    throw Error("must not dispatch");
  });
  await assert.rejects(f.session.createThread(), /already created/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.state.selected, "original");
});

test("allocated native ID on uncertain create is recovered without another create or model send", async () => {
  const f = await fixture();
  f.setRespond(async () => {
    const e = Error("uncertain");
    e.createdThreadID = "local_original";
    throw e;
  });
  await assert.rejects(f.session.createThread(), /uncertain/);
  assert.equal(f.state.selected, "local_original");
  assert.equal(f.calls.length, 1);
  assert.equal(f.nodes.get("message")?.value ?? "draft", "draft");
});

test("accepted creation survives a later options refresh and legacy catalogs get no UUID", async () => {
  const f = await fixture();
  f.catalog.capabilities = { background_creation: true };
  f.setRespond(async () => {
    f.state.optionsSeq++;
    return { id: "legacy", cwd: "/project" };
  });
  assert.equal((await f.session.createThread()).id, "legacy");
  assert.equal(f.calls[0].request_id, undefined);
});

test("a stale preflight cannot create or reserve a native request", async () => {
  const f = await fixture();
  Object.defineProperty(f.catalog, "agent", {
    get: () => {
      f.state.optionsSeq++;
      return { id: "claude-desktop" };
    },
  });
  await assert.rejects(f.session.createThread(), /Connection failed/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.sessionStorage.data.size, 0);
});

test("receipt limits and malformed stored state fail closed without eviction", async () => {
  global.crypto ||= webcrypto;
  const { createCreationRequests } = await helperPromise,
    s = storage(),
    requests = createCreationRequests(s);
  for (let i = 0; i < 100; i++)
    requests.reserve(["device", "agent", "/p" + i], {});
  assert.throws(
    () => requests.reserve(["device", "agent", "/overflow"], {}),
    /Unable to preserve/,
  );
  assert.equal(s.length, 100);
  const key = [...s.data.keys()][0];
  s.data.set(key, "not json");
  assert.throws(
    () => requests.reserve(["device", "agent", "/p0"], {}),
    /Unable to preserve/,
  );
});

test("native creation composer sends the first draft exactly once after the empty receipt", async () => {
  const f = await fixture(),
    source = await fs.readFile(
      path.join(root, "features/composer.jsx"),
      "utf8",
    ),
    helpers = await fs.readFile(
      path.join(root, "features/owner-capabilities.js"),
      "utf8",
    );
  const { createComposer } = await import(
    moduleURL(
      source.replaceAll(
        '"./owner-capabilities"',
        JSON.stringify(moduleURL(helpers)),
      ),
    )
  );
  Object.assign(f.state, {
    attachments: [],
    skills: [],
    mentions: [],
    tools: [],
    catalog: { capabilities: {} },
    live: {},
    liveRevision: 0,
  });
  const message = { value: "first native message" },
    turns = [];
  const composer = createComposer({
    state: f.state,
    $: () => message,
    nativeSettings: () => !!f.state.selected,
    shouldQueue: () => false,
    requireOwner: () => {},
    ownerEpoch: () => f.state.live.owner?.epoch || "",
    updateControls: () => {},
    renderCurrent: () => {},
    notice: () => {},
    createThread: f.session.createThread,
    resetQueue: () => {},
    detail: async (_g, created) => {
      if (created) f.state.live = created.live || { owner: { epoch: "owner" } };
    },
    ensureStream: () => {},
    api: async (p, b) => {
      turns.push({ p, b });
      return { accepted: true };
    },
    applyQueue: () => {},
    clearDraft: () => {
      message.value = "";
    },
    refreshQueue: async () => {},
    list: async () => {},
  });
  await composer.submit();
  assert.equal(f.calls.length, 1);
  assert.equal(turns.length, 1);
  assert.equal(turns[0].p, "threads/created/turn");
  assert.equal(turns[0].b.text, "first native message");
  assert.equal(turns[0].b.permission, undefined);
  assert.equal(message.value, "");
});
