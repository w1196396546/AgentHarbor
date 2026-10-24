const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");

async function fixture(api) {
  const source = await fs.readFile(
    path.resolve(__dirname, "../web/src/features/indexes.js"),
    "utf8",
  );
  const { createReadIndexes } = await import(
    "data:text/javascript;base64," + Buffer.from(source).toString("base64")
  );
  const state = {
    device: { id: "fixture-device" },
    selected: "thread",
    generation: 1,
    project: "/fixture",
    cwd: "/fixture",
    live: { owner: { epoch: "one" } },
    catalog: {
      capabilities: { conversation_index: true },
      protocol_versions: { conversation_index: 1 },
    },
  };
  return {
    state,
    index: createReadIndexes({
      state,
      getAgent: () => ({ id: "fixture-agent" }),
      api,
    }),
  };
}

test("read indexes require a declared protocol and preserve failed or partial reads", async () => {
  const calls = [];
  let result = {
    version: 1,
    turns: [{ id: "first" }],
    scope: "loaded",
    has_more: true,
    next_cursor: "next",
    truncated: true,
  };
  const { state, index } = await fixture(async (...args) => {
    calls.push(args);
    if (result instanceof Error) throw result;
    return result;
  });
  delete state.catalog.protocol_versions;
  await index.load("conversation_index", "turns", "turns");
  assert.equal(calls.length, 0, "old connections never receive new API calls");
  state.catalog.protocol_versions = { conversation_index: 1 };
  await index.load("conversation_index", "turns", "turns");
  assert.equal(calls[0][0], "threads/thread/turns");
  assert.equal(
    calls[0][2].observation,
    true,
    "optional index failure must not change controls",
  );
  result = new Error("fixture read unavailable");
  await index.load("conversation_index", "turns", "turns", undefined, true);
  let page = index.read("conversation_index", "turns", "turns");
  assert.deepEqual(page.items, [{ id: "first" }]);
  assert.equal(page.error, "fixture read unavailable");
  result = {
    version: 1,
    turns: [{ id: "second" }],
    scope: "full",
    has_more: true,
    next_cursor: "next",
  };
  await index.load("conversation_index", "turns", "turns", undefined, true);
  page = index.read("conversation_index", "turns", "turns");
  assert.deepEqual(
    page.items.map(({ id }) => id),
    ["first", "second"],
  );
  assert.equal(
    page.scope,
    "loaded",
    "partial source scope remains visible across pages",
  );
  assert.equal(page.truncated, true);
  assert.equal(page.hasMore, false, "a repeated cursor terminates pagination");
  assert.match(page.error, /cursor did not advance/);
});

test("late index replies cannot cross owner or selection generations", async () => {
  let finish;
  const { state, index } = await fixture(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const request = index.load("conversation_index", "turns", "turns");
  state.live.owner.epoch = "two";
  finish({
    version: 1,
    turns: [{ id: "stale" }],
    scope: "full",
    has_more: false,
  });
  await request;
  let page = index.read("conversation_index", "turns", "turns");
  assert.equal(page.loaded, false);
  assert.deepEqual(page.items, []);
  const next = index.load("conversation_index", "turns", "turns");
  state.generation++;
  finish({
    version: 1,
    turns: [{ id: "stale-generation" }],
    scope: "full",
    has_more: false,
  });
  await next;
  page = index.read("conversation_index", "turns", "turns");
  assert.equal(page.loaded, false);
  assert.deepEqual(page.items, []);
});

test("malformed index pages remain unknown instead of becoming empty success", async () => {
  const { index } = await fixture(async () => ({
    version: 2,
    turns: [],
    scope: "full",
    has_more: false,
  }));
  await index.load("conversation_index", "turns", "turns");
  const page = index.read("conversation_index", "turns", "turns");
  assert.equal(page.loaded, false);
  assert.match(page.error, /unavailable or unsupported/);
});

test("the cumulative result limit is visibly incomplete at the exact boundary", async () => {
  let call = 0;
  const { index } = await fixture(async () => {
    const first = call++ * 200;
    return {
      version: 1,
      turns: Array.from({ length: 200 }, (_, offset) => ({
        id: "turn-" + (first + offset),
      })),
      scope: "full",
      has_more: true,
      next_cursor: "cursor-" + call,
    };
  });
  await index.load("conversation_index", "turns", "turns");
  for (let i = 1; i < 10; i++)
    await index.load("conversation_index", "turns", "turns", undefined, true);
  const page = index.read("conversation_index", "turns", "turns");
  assert.equal(page.items.length, 2000);
  assert.equal(page.hasMore, false);
  assert.equal(page.truncated, true);
});
