const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { transformSync } = require("esbuild");

function fixture(api) {
  const pathModule = { exports: {} };
  vm.runInNewContext(
    transformSync(
      fs.readFileSync(
        path.resolve(__dirname, "../web/src/project-paths.js"),
        "utf8",
      ),
      { format: "cjs" },
    ).code,
    { module: pathModule },
  );
  const nodes = new Map();
  const $ = (id) => {
    if (!nodes.has(id))
      nodes.set(id, { value: "", querySelectorAll: () => [] });
    return nodes.get(id);
  };
  const module = { exports: {} };
  const source = transformSync(
    fs.readFileSync(
      path.resolve(__dirname, "../web/src/features/sessions.jsx"),
      "utf8",
    ),
    { loader: "jsx", format: "cjs", jsx: "automatic" },
  ).code;
  vm.runInNewContext(source, {
    module,
    URLSearchParams,
    require: (name) =>
      name === "../project-paths"
        ? pathModule.exports
        : name === "react/jsx-runtime"
          ? require(name)
          : name === "../render"
            ? { renderView: () => {} }
            : {},
  });
  const state = {
    selected: "thread",
    project: "/project",
    generation: 1,
    liveRevision: 0,
    live: { options: { model: "confirmed" } },
    prefs: { model: "confirmed" },
    catalog: { capabilities: { subagents: true } },
    optionsLoaded: true,
    sessions: [],
    projects: ["/project"],
    listProject: "",
    listSeq: 0,
    optionsSeq: 0,
    attachments: [],
    skills: [],
    mentions: [],
    tools: [],
  };
  let reads = 0;
  const sessions = module.exports.createSessions({
    state,
    api,
    $,
    t: (value) => value,
    sourceLabel: (value) => value,
    getLanguage: () => "en",
    getAgent: () => ({ id: "codex" }),
    ownerEpoch: () => "epoch",
    requireOwner: () => {},
    updateControls: () => {},
    renderRequests: () => {},
    ensureStream: () => {},
    refreshQueue: () => {},
    notice: () => {},
    detail: async () => {
      reads++;
      throw new Error("history unavailable");
    },
  });
  return { sessions, state, reads: () => reads };
}

test("creation rechecks project capability without replacing the loaded catalog", async () => {
  const calls = [];
  let capability = true;
  const f = fixture(async (path, body) => {
    calls.push({ path, body });
    if (path.startsWith("options?"))
      return {
        agent: { id: "codex" },
        capabilities: { background_creation: capability },
      };
    return { id: "created" };
  });
  assert.equal((await f.sessions.createThread()).id, "created");
  const query = new URLSearchParams(calls[0].path.split("?")[1]);
  assert.equal(query.get("project"), "/project");
  assert.equal(query.get("scope"), "creation");
  assert.equal(query.has("thread"), false);
  assert.equal(calls[1].body.executor, "background");
  assert.equal(f.state.catalog.capabilities.subagents, true);
  assert.equal(f.state.optionsLoaded, true);
  capability = false;
  await assert.rejects(
    f.sessions.createThread(),
    /Background conversations are unavailable/,
  );
  assert.equal(calls.filter(({ path }) => path === "threads").length, 1);
});

test("confirmed settings unlock controls without waiting for history", async () => {
  const f = fixture(async (path) => {
    assert.equal(path, "threads/thread/settings");
    return { options: { model: "confirmed", mode: "plan" } };
  });
  await f.sessions.applyPreferences({ mode: "plan" });
  assert.equal(f.state.prefs.mode, "plan");
  assert.equal(f.state.live.options.mode, "plan");
  assert.equal(f.state.settingsMutation, null);
  assert.equal(f.state.liveRevision, 1);
  assert.equal(f.reads(), 0);
});

test("advertised control options unlock settings while supplemental tools are pending", async () => {
  let releaseInventory;
  const calls = [],
    f = fixture(async (path) => {
      calls.push(path);
      const query = new URLSearchParams(path.split("?")[1]);
      if (query.get("scope") === "controls")
        return {
          agent: { id: "codex" },
          models: [{ id: "confirmed" }],
          capabilities: { controls_options: true, tools: true },
        };
      return new Promise((resolve) => {
        releaseInventory = resolve;
      });
    });
  f.state.catalog.capabilities.controls_options = true;
  const loading = f.sessions.loadOptions();
  await new Promise(setImmediate);
  assert.equal(
    new URLSearchParams(calls[0].split("?")[1]).get("scope"),
    "controls",
  );
  await loading;
  assert.equal(f.state.optionsLoaded, true);
  assert.deepEqual(f.state.catalog.models, [{ id: "confirmed" }]);
  assert.equal(calls.length, 2);
  assert.equal(new URLSearchParams(calls[1].split("?")[1]).has("scope"), false);
  releaseInventory({
    agent: { id: "codex" },
    models: [{ id: "confirmed" }],
    skills: [],
    tools: [{ name: "supplemental-tool" }],
    capabilities: { controls_options: true, tools: true },
  });
  await new Promise(setImmediate);
  assert.equal(f.state.catalog.tools[0].name, "supplemental-tool");
  assert.equal(f.state.optionsLoaded, true);
});

test("failed or superseded supplemental catalogs cannot disable confirmed controls", async () => {
  for (const stale of [false, true]) {
    let completeInventory;
    const f = fixture(async (path) => {
      if (new URLSearchParams(path.split("?")[1]).get("scope") === "controls")
        return { capabilities: { controls_options: true }, models: [] };
      return new Promise((resolve, reject) => {
        completeInventory = stale ? resolve : reject;
      });
    });
    f.state.catalog.capabilities.controls_options = true;
    const loading = f.sessions.loadOptions();
    await new Promise(setImmediate);
    assert.equal(f.state.optionsLoaded, true);
    await loading;
    const confirmed = f.state.catalog;
    if (stale) {
      f.state.optionsSeq++;
      completeInventory({ models: [{ id: "old-model" }] });
    } else completeInventory(new Error("Tool inventory unavailable"));
    await new Promise(setImmediate);
    assert.equal(f.state.catalog, confirmed);
    assert.equal(f.state.optionsLoaded, true);
  }
});

test("a superseded creation preflight cannot authorize creation or misreport unavailability", async () => {
  for (const available of [true, false]) {
    let reply,
      creates = 0;
    const f = fixture(async (path) => {
      if (path.startsWith("options?"))
        return new Promise((resolve) => {
          reply = resolve;
        });
      creates++;
      return { id: "must-not-create" };
    });
    const creating = f.sessions.createThread();
    f.state.optionsSeq++;
    reply({ capabilities: { background_creation: available } });
    await assert.rejects(creating, /Connection failed\./);
    assert.equal(creates, 0);
    assert.equal(f.state.sessions.length, 0);
    assert.equal(f.state.optionsLoaded, true);
  }
});

test("refresh after creation dispatch does not discard its confirmed receipt", async () => {
  let reply, started;
  const sent = new Promise((resolve) => {
    started = resolve;
  });
  const f = fixture(async (path) => {
    if (path.startsWith("options?"))
      return { capabilities: { background_creation: true } };
    started();
    return new Promise((resolve) => {
      reply = resolve;
    });
  });
  const creating = f.sessions.createThread();
  await sent;
  f.state.optionsSeq++;
  reply({ id: "accepted-once" });
  assert.equal((await creating).id, "accepted-once");
  assert.equal(f.state.sessions[0].id, "accepted-once");
});

test("confirmed shared creation is immediately grouped and survives delayed native indexing without changing owners", async () => {
  let rows = [];
  const f = fixture(async (path) => {
    if (path.startsWith("options?"))
      return { capabilities: { background_creation: true } };
    if (path === "threads")
      return {
        id: "created",
        source: "codex-app",
        cwd: "\\\\?\\e:\\WORK\\shop",
      };
    return {
      sessions: rows,
      projects: ["E:\\work\\shop"],
      sidebar_projects: [
        { id: "shop", name: "App Shop", root_paths: ["E:\\work\\shop"] },
      ],
      next: rows.length,
    };
  });
  f.state.project = "E:\\work\\shop";
  f.state.projects = [f.state.project];
  f.state.sidebarProjects = [
    { id: "shop", name: "App Shop", root_paths: [f.state.project] },
  ];
  f.state.live.owner = {
    kind: "native",
    state: "connected",
    epoch: "shared-owner",
  };
  const created = await f.sessions.createThread();
  assert.equal(f.state.sessions[0].id, "created");
  assert.equal(created.project_id, "shop");
  assert.equal(f.sessions.projectName("\\\\?\\e:\\WORK\\shop"), "App Shop");
  assert.equal(
    f.sessions.projectName("\\\\?\\e:\\WORK\\shop\\nested"),
    "App Shop",
  );
  assert.equal(f.state.live.owner.epoch, "shared-owner");
  f.state.sessions[0].title = "Confirmed native title";
  await f.sessions.list();
  assert.equal(f.state.sessions[0].title, "Confirmed native title");
  assert.equal(f.state.sessions[0].project_id, "shop");
  rows = [{ ...created, title: "Indexed native title" }];
  await f.sessions.list();
  assert.equal(f.state.sessions.length, 1);
  assert.equal(f.state.sessions[0].title, "Indexed native title");
  rows = [];
  await f.sessions.list();
  assert.equal(
    f.state.sessions.length,
    0,
    "the confirmed native catalog becomes authoritative again",
  );
});

test("nested workspaces use the longest containing App project name, including UNC paths", () => {
  const f = fixture(async () => {});
  f.state.sidebarProjects = [
    { id: "parent", name: "Parent project", root_paths: ["E:\\work"] },
    { id: "shop", name: "Shop project", root_paths: ["E:\\work\\shop"] },
    {
      id: "network",
      name: "Shared project",
      root_paths: ["\\\\Server\\Share\\Shop"],
    },
  ];
  assert.equal(
    f.sessions.projectName("\\\\?\\e:\\WORK\\shop\\nested"),
    "Shop project",
  );
  assert.equal(
    f.sessions.projectName("E:/work/other/nested"),
    "Parent project",
  );
  assert.equal(
    f.sessions.projectName("\\\\?\\UNC\\server\\share\\SHOP\\nested"),
    "Shared project",
  );
  assert.equal(f.sessions.projectName("E:/work-copy/nested"), "nested");
  assert.equal(
    f.sessions.projectName("\\\\?\\e:\\WORK\\shop\\notes.txt", false),
    "notes.txt",
  );
  assert.equal(
    f.sessions.projectName("\\\\?\\UNC\\server\\share\\SHOP\\chart.png", false),
    "chart.png",
  );
});

test("an older list cannot erase a creation receipt and archived or other-device rows are not resurrected", async () => {
  let reply,
    delayed = true,
    archived = false;
  const f = fixture(async (path) => {
    if (path.startsWith("options?"))
      return { capabilities: { background_creation: true } };
    if (path === "threads") return { id: "created" };
    if (delayed)
      return new Promise((resolve) => {
        reply = resolve;
      });
    return {
      sessions: [],
      projects: ["/project"],
      archived_ids: archived ? ["created"] : [],
      next: 0,
    };
  });
  const oldList = f.sessions.list();
  await f.sessions.createThread();
  delayed = false;
  reply({ sessions: [], projects: ["/project"], next: 0 });
  await oldList;
  assert.equal(f.state.sessions[0].id, "created");
  archived = true;
  await f.sessions.list();
  assert.equal(f.state.sessions.length, 0);
  archived = false;
  await f.sessions.list();
  assert.equal(f.state.sessions.length, 0);
  await f.sessions.createThread();
  f.sessions.forgetCreatedThread("created");
  f.state.sessions = [];
  await f.sessions.list();
  assert.equal(
    f.state.sessions.length,
    0,
    "an archive event discards an unindexed receipt",
  );
  await f.sessions.createThread();
  f.state.device = { id: "other-device" };
  f.state.sessions = [];
  await f.sessions.list();
  assert.equal(
    f.state.sessions.length,
    0,
    "creation receipts must not cross devices",
  );
});

test("unindexed receipts do not survive authorization reset or removal of a shared project", async () => {
  let projects = ["/project"];
  const f = fixture(async (path) => {
    if (path.startsWith("options?"))
      return { capabilities: { background_creation: true } };
    if (path === "threads") return { id: "created" };
    return { sessions: [], projects, next: 0 };
  });
  await f.sessions.createThread();
  f.sessions.clearCreatedThreads();
  f.state.sessions = [];
  await f.sessions.list();
  assert.equal(f.state.sessions.length, 0);
  await f.sessions.createThread();
  projects = [];
  await f.sessions.list();
  assert.equal(
    f.state.sessions.length,
    0,
    "a removed project kept a stale pending conversation",
  );
  projects = ["/project"];
  await f.sessions.list();
  assert.equal(
    f.state.sessions.length,
    0,
    "re-sharing a project restored an old receipt",
  );
});
