const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");

test("an unavailable optional index does not mark the execution device offline", async (context) => {
  const source = await fs.readFile(path.resolve(__dirname, "../web/src/transport/api.js"), "utf8");
  const { createAPI } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
  const previous = global.window;
  context.after(() => { global.window = previous; });
  global.window = { RemoteSecure: { fetch: async () => new Response(
    JSON.stringify({ error: "History index unavailable" }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  ) } };
  const offline = [], api = createAPI({
    state: { generation: 1, live: {} },
    getAgent: () => ({ id: "codex" }),
    actionCapability: () => "",
    setDeviceOnline: (value) => offline.push(value),
    requireOwner: () => assert.fail("read index requested execution ownership"),
    showPair: () => assert.fail("index outage revoked browser authorization"),
    archiveConversation: () => assert.fail("index outage archived the conversation"),
    unavailableConversation: () => assert.fail("index outage disabled conversation controls"),
  }).api;
  await assert.rejects(api("threads/thread/turns", undefined, { observation: true }), /History index unavailable/);
  assert.deepEqual(offline, []);
  await assert.rejects(api("sessions/thread"), /Your computer is offline/);
  assert.deepEqual(offline, [false]);
});
