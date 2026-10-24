const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { transformSync } = require("esbuild");

function fixture(api) {
  const module = { exports: {} };
  const source = transformSync(
    fs.readFileSync(
      path.resolve(__dirname, "../web/src/features/sessions.jsx"),
      "utf8",
    ),
    { loader: "jsx", format: "cjs" },
  ).code;
  vm.runInNewContext(source, {
    module,
    URLSearchParams,
    require: () => ({}),
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
  };
  let reads = 0;
  const sessions = module.exports.createSessions({
    state,
    api,
    getAgent: () => ({ id: "codex" }),
    ownerEpoch: () => "epoch",
    requireOwner: () => {},
    updateControls: () => {},
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
