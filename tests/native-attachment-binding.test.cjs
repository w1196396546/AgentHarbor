const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.join(__dirname, "../web/src/features");
const noop = () => {};

async function load(name, helper) {
  const source = await fs.readFile(path.join(root, name), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      module,
      exports: module.exports,
      document: { addEventListener: noop },
      window: { addEventListener: noop },
      require: (name) =>
        name === "./owner-capabilities"
          ? helper
          : { renderView: noop, clearView: noop },
    },
  );
  return module.exports;
}

async function fixture(capabilities, running = true) {
  const helper = await load("owner-capabilities.js");
  const { createOwners } = await load("owners.jsx", helper);
  const { bindWorkspace } = await load("bindings.jsx", helper);
  const state = {
    selected: "session",
    agentDiscovered: true,
    running,
    currentRequests: [],
    queue: [],
    live: { owner: { state: "connected", capabilities } },
  };
  const { ownerCan } = createOwners({ state });
  const nodes = new Map();
  let clicks = 0;
  const $ = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        addEventListener: noop,
        click: () => {
          if (id === "fileInput") clicks++;
        },
      });
    return nodes.get(id);
  };
  bindWorkspace(
    new Proxy(
      { $, state, ownerCan },
      {
        get: (target, key) => target[key] || noop,
      },
    ),
  );
  return { state, click: () => $("attach").onclick(), clicks: () => clicks };
}

test("running attachment click uses queue_add while idle click uses send", async () => {
  const f = await fixture({ send: false, queue: false, queue_add: true });
  f.click();
  assert.equal(f.clicks(), 1);
  f.state.running = false;
  f.click();
  assert.equal(f.clicks(), 1);
  f.state.live.owner.capabilities.send = true;
  f.click();
  assert.equal(f.clicks(), 2);
});

test("attachment binding respects explicit denial and legacy queue fallback", async () => {
  const denied = await fixture({ send: true, queue: true, queue_add: false });
  denied.click();
  assert.equal(denied.clicks(), 0);
  const legacy = await fixture({ send: false, queue: true });
  legacy.click();
  assert.equal(legacy.clicks(), 1);
  legacy.state.live.owner.state = "observing";
  legacy.click();
  assert.equal(legacy.clicks(), 1);
});

test("pending requests and queued input use queue attachment permission", async () => {
  const f = await fixture({ send: false, queue_add: true }, false);
  f.state.currentRequests = [{ id: "pending" }];
  f.click();
  f.state.currentRequests = [];
  f.state.queue = [{ id: "queued" }];
  f.click();
  assert.equal(f.clicks(), 2);
});
