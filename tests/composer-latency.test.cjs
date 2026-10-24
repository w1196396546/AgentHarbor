const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");

const composer = fs
  .readFile(path.resolve(__dirname, "../web/src/features/composer.jsx"), "utf8")
  .then(
    (source) =>
      import(
        "data:text/javascript;base64," + Buffer.from(source).toString("base64")
      ),
  );

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function fixture(overrides = {}) {
  const { createComposer } = await composer,
    message = { value: "First message", style: {}, scrollHeight: 32 },
    state = {
      selected: "thread",
      project: "/project",
      generation: 1,
      liveRevision: 0,
      live: { owner: { epoch: "owner" } },
      attachments: [{ id: "file" }],
      skills: [],
      mentions: [],
      tools: [],
      prefs: {},
      catalog: { capabilities: { queue: true } },
    },
    notices = [],
    calls = [];
  const { submit } = createComposer({
    $: () => message,
    state,
    nativeSettings: () => true,
    shouldQueue: () => false,
    requireOwner: () => {},
    ownerEpoch: () => state.live.owner?.epoch || "",
    updateControls: () => {},
    renderCurrent: () => {
      state.running = ["starting", "inProgress"].includes(state.live.status);
      state.turnID = state.live.turn_id || "";
    },
    notice: (text) => notices.push(text),
    createThread: () => assert.fail("unexpected creation"),
    resetQueue: () => {},
    detail: async () => {},
    ensureStream: () => {},
    api: async (url, value) => {
      calls.push({ url, value });
      return { turn_id: "accepted-turn" };
    },
    applyQueue: () => {},
    clearDraft: () => {
      message.value = "";
      state.attachments = [];
    },
    refreshQueue: async () => {},
    list: async () => {},
    ...overrides,
  });
  return { submit, message, state, notices, calls };
}

test("confirmed sending releases the composer before metadata reads and cannot unlock a later send", async () => {
  const firstAck = deferred(),
    secondAck = deferred(),
    refreshed = deferred(),
    readStarted = deferred();
  let sends = 0,
    reads = 0;
  const f = await fixture({
    api: () => (++sends === 1 ? firstAck.promise : secondAck.promise),
    detail: () => {
      reads++;
      readStarted.resolve();
      return refreshed.promise;
    },
  });
  const first = f.submit();
  f.state.live.status = "inProgress";
  assert.equal(
    f.message.value,
    "First message",
    "thinking alone is no delivery receipt",
  );
  assert.equal(f.state.sending, true);
  firstAck.resolve({ turn_id: "accepted-turn" });
  await readStarted.promise;
  assert.equal(f.message.value, "");
  assert.equal(
    f.state.sending,
    false,
    "metadata reads must not lock the composer",
  );
  assert.equal(f.state.turnID, "accepted-turn");
  assert.equal(f.state.running, true);

  f.message.value = "Next message";
  const next = f.submit();
  assert.equal(f.state.sending, true);
  refreshed.resolve();
  await first;
  assert.equal(
    f.state.sending,
    true,
    "the old finally must not unlock a newer send",
  );
  secondAck.reject(new Error("Delivery could not be confirmed"));
  await assert.rejects(next, /could not be confirmed/);
  assert.equal(f.message.value, "Next message");
  assert.equal(f.state.sending, false);
  assert.equal(reads, 1);
});

test("late confirmation preserves edited text and attachments and a newer streamed completion", async () => {
  const ack = deferred(),
    f = await fixture({ api: () => ack.promise });
  const sending = f.submit();
  f.message.value = "Edited while waiting";
  f.state.attachments.push({ id: "next-file" });
  f.state.liveRevision++;
  f.state.live.status = "completed";
  f.state.live.turn_id = "accepted-turn";
  ack.resolve({ turn_id: "accepted-turn" });
  await sending;
  assert.equal(f.message.value, "Edited while waiting");
  assert.deepEqual(
    f.state.attachments.map((file) => file.id),
    ["file", "next-file"],
  );
  assert.equal(f.state.live.status, "completed");
  assert.equal(f.state.sending, false);
});

test("a refresh failure after acceptance reports the read error without failing or resending delivery", async () => {
  const f = await fixture({
    detail: async () => {
      throw new Error("History temporarily unavailable");
    },
  });
  await f.submit();
  assert.equal(f.calls.length, 1);
  assert.equal(f.message.value, "");
  assert.equal(f.state.sending, false);
  assert.deepEqual(f.notices, ["History temporarily unavailable"]);
});

test("a late creation receipt cannot select or send through a newer conversation", async () => {
  const created = deferred();
  const f = await fixture({ createThread: () => created.promise });
  f.state.selected = "";
  f.state.live = {};
  const sending = f.submit();
  f.state.generation++;
  f.state.selected = "newer-selection";
  f.state.live = { owner: { epoch: "newer-owner" } };
  created.resolve({
    id: "late-created",
    live: { items: [], owner: { state: "connected", epoch: "late-owner" } },
  });
  await sending;
  assert.equal(f.state.selected, "newer-selection");
  assert.equal(f.state.live.owner.epoch, "newer-owner");
  assert.equal(f.calls.length, 0);
  assert.equal(f.message.value, "First message");
});
