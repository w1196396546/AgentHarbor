const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");

const asModule = (source) =>
  "data:text/javascript;base64," + Buffer.from(source).toString("base64");
async function fixture(missedConfirmations = 0) {
  const root = path.resolve(__dirname, "../web/src/features");
  const helper = asModule(
    await fs.readFile(path.join(root, "owner-capabilities.js"), "utf8"),
  );
  const source = (
    await fs.readFile(path.join(root, "owners.jsx"), "utf8")
  ).replaceAll('"./owner-capabilities"', JSON.stringify(helper));
  const { createOwners } = await import(asModule(source));
  const state = {
    selected: "fixture",
    generation: 1,
    liveRevision: 0,
    agentDiscovered: true,
    optionsLoaded: true,
    currentRequests: [],
    session: { source: "codex-app" },
    catalog: { capabilities: { connection_metadata: true } },
    history: [],
    live: {
      items: [],
      owner: {
        kind: "native",
        state: "observing",
        capabilities: { background_connect: true },
      },
    },
  };
  const connected = {
    items: [],
    options: { model: "confirmed" },
    owner: {
      kind: "native",
      state: "connected",
      epoch: "confirmed",
      capabilities: { configure: true, send: true },
    },
  };
  const nodes = new Map();
  const $ = (id) => {
    if (!nodes.has(id)) nodes.set(id, {});
    return nodes.get(id);
  };
  let reply,
    reads = 0;
  const response = new Promise((resolve) => {
    reply = resolve;
  });
  const owners = createOwners({
    state,
    $,
    t: (x) => x,
    getAgent: () => ({ id: "codex", sourceLabel: (x) => x }),
    closeReasoning: () => {},
    closeMenu: () => {},
    updateConnection: () => {},
    ensureStream: () => {},
    renderCurrent: () => {},
    mergeOrdered: (a, b) => [...a, ...b],
    api: () => response,
    connectionMetadata: async (generation, refresh) => {
      assert.equal(generation, state.generation);
      assert.equal(refresh, true);
      reads++;
      if (reads > missedConfirmations) state.live = connected;
      state.liveRevision++;
    },
    detail: () => assert.fail("owner confirmation must not load history"),
  });
  return {
    state,
    owners,
    reads: () => reads,
    reply: () => reply({ connected: true, live: connected }),
  };
}

test("observing SSE before connect acknowledgement triggers lightweight owner confirmation", async () => {
  const f = await fixture();
  const connecting = f.owners.connectOriginalOwner();
  f.state.liveRevision++;
  f.reply();
  await connecting;
  assert.equal(f.reads(), 1);
  assert.equal(f.owners.canConfigure(), true);
  assert.equal(f.state.connectingOwner, false);
});

test("owner confirmation tolerates another racing event and bounds unsuccessful reads", async () => {
  for (const missed of [1, 3]) {
    const f = await fixture(missed);
    const connecting = f.owners.connectOriginalOwner();
    f.state.liveRevision++;
    f.reply();
    if (missed === 3) {
      await assert.rejects(connecting, /Connection failed/);
      assert.equal(f.state.connectOwnerFailed, true);
    } else {
      await connecting;
      assert.equal(f.owners.canConfigure(), true);
    }
    assert.equal(f.reads(), Math.min(missed + 1, 3));
    assert.equal(f.state.connectingOwner, false);
  }
});

test("connect acknowledgement preserves a newer confirmed owner and changed selection", async () => {
  for (const navigate of [false, true]) {
    const f = await fixture();
    const connecting = f.owners.connectOriginalOwner();
    f.state.liveRevision++;
    const newer = {
      owner: {
        state: "connected",
        epoch: "newer",
        capabilities: { configure: true },
      },
    };
    f.state.live = newer;
    if (navigate) {
      f.state.selected = "another";
      f.state.generation++;
    }
    f.reply();
    await connecting;
    assert.equal(f.state.live, newer);
    assert.equal(f.reads(), 0);
  }
});
