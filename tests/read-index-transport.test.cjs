const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

async function pendingBodyFixture() {
  const source = await fs.readFile(
    path.resolve(__dirname, "../web/src/transport/api.js"),
    "utf8",
  );
  let start,
    complete,
    signal,
    timeout,
    cleared = false;
  const started = new Promise((resolve) => {
    start = resolve;
  });
  const createAPI = vm.runInNewContext(
    source.replace("export function createAPI", "function createAPI") +
      "; createAPI",
    {
      FormData,
      AbortController,
      DOMException,
      setTimeout: (callback) => {
        timeout = callback;
        return 1;
      },
      clearTimeout: () => {
        cleared = true;
      },
      window: {
        RemoteSecure: {
          fetch: async (_path, init) => {
            signal = init.signal;
            return {
              status: 200,
              ok: true,
              text: () =>
                new Promise((resolve, reject) => {
                  complete = () => resolve('{"ok":true}');
                  signal.addEventListener(
                    "abort",
                    () => reject(signal.reason),
                    { once: true },
                  );
                  start();
                }),
            };
          },
        },
      },
    },
  );
  const client = createAPI({
    state: { generation: 1, live: {} },
    getAgent: () => ({ id: "codex" }),
    actionCapability: () => "",
  });
  return {
    ...client,
    started,
    complete: () => complete(),
    expire: () => timeout(),
    signal: () => signal,
    cleared: () => cleared,
  };
}

test("Agent cancellation remains active until the response body finishes", async () => {
  const f = await pendingBodyFixture(),
    pending = f.api("sessions/thread");
  await f.started;
  assert.equal(f.cleared(), false, "headers are not a complete response");
  f.cancelAPI();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(f.signal().aborted, true);
  assert.equal(f.cleared(), true);
});

test("owner connection cancellation reaches a pending response body", async () => {
  const f = await pendingBodyFixture(),
    controller = new AbortController(),
    pending = f.api(
      "threads/thread/connect",
      { executor: "background" },
      { signal: controller.signal },
    );
  await f.started;
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(f.signal().aborted, true);
});

test("response body timeout is bounded and successful reads release cancellation", async () => {
  const f = await pendingBodyFixture(),
    pending = f.api("sessions/thread");
  await f.started;
  f.expire();
  await assert.rejects(pending, { name: "AbortError" });
  const success = await pendingBodyFixture(),
    completed = success.api("sessions/thread");
  await success.started;
  success.complete();
  assert.equal((await completed).ok, true);
  success.cancelAPI();
  assert.equal(
    success.signal().aborted,
    false,
    "a completed read must leave the active set",
  );
  assert.equal(success.cleared(), true);
});

test("an unavailable optional index does not mark the execution device offline", async (context) => {
  const source = await fs.readFile(
    path.resolve(__dirname, "../web/src/transport/api.js"),
    "utf8",
  );
  const { createAPI } = await import(
    "data:text/javascript;base64," + Buffer.from(source).toString("base64")
  );
  const previous = global.window;
  context.after(() => {
    global.window = previous;
  });
  global.window = {
    RemoteSecure: {
      fetch: async () =>
        new Response(JSON.stringify({ error: "History index unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
    },
  };
  const offline = [],
    api = createAPI({
      state: { generation: 1, live: {} },
      getAgent: () => ({ id: "codex" }),
      actionCapability: () => "",
      setDeviceOnline: (value) => offline.push(value),
      requireOwner: () =>
        assert.fail("read index requested execution ownership"),
      showPair: () => assert.fail("index outage revoked browser authorization"),
      archiveConversation: () =>
        assert.fail("index outage archived the conversation"),
      unavailableConversation: () =>
        assert.fail("index outage disabled conversation controls"),
    }).api;
  await assert.rejects(
    api("threads/thread/turns", undefined, { observation: true }),
    /History index unavailable/,
  );
  assert.deepEqual(offline, []);
  await assert.rejects(api("sessions/thread"), /History index unavailable/);
  assert.deepEqual(offline, []);
});

test("engine failures recheck device truth without replaying writes or leaking Agent discovery", async (context) => {
  const source = await fs.readFile(
    path.resolve(__dirname, "../web/src/transport/api.js"),
    "utf8",
  );
  const { createAPI } = await import(
    "data:text/javascript;base64," + Buffer.from(source).toString("base64")
  );
  const previous = global.window,
    previousFetch = global.fetch;
  context.after(() => {
    global.window = previous;
    global.fetch = previousFetch;
  });
  const calls = [],
    offline = [],
    state = { generation: 1, live: {} };
  let checks = 0,
    changeGeneration = false;
  global.window = {
    RemoteSecure: {
      fetch: async (path, init) => {
        calls.push({ path, init });
        if (changeGeneration) state.generation++;
        return new Response(
          JSON.stringify({
            error: "Native owner disconnected",
            ...(path === "threads"
              ? { created_thread_id: "allocated-original" }
              : {}),
          }),
          { status: 503 },
        );
      },
    },
  };
  global.fetch = async () =>
    new Response(JSON.stringify({ error: "Computer unavailable" }), {
      status: 503,
    });
  const { api } = createAPI({
    state,
    getAgent: () => ({ id: "claude-desktop" }),
    actionCapability: () => "",
    checkDevice: () => checks++,
    setDeviceOnline: (online) => offline.push(online),
  });
  await assert.rejects(api("agents"), /Native owner disconnected/);
  assert.equal(calls[0].init.headers["X-Remote-Agent"], undefined);
  for (const path of [
    "options?thread=original",
    "sessions/original",
    "threads/original/turn",
  ])
    await assert.rejects(
      api(path, path.endsWith("/turn") ? { text: "one attempt" } : undefined),
      /Native owner disconnected/,
    );
  await assert.rejects(
    api("threads", {}),
    (error) => error.createdThreadID === "allocated-original",
  );
  assert.equal(calls.filter((call) => call.path.endsWith("/turn")).length, 1);
  assert.equal(checks, 5);
  assert.deepEqual(offline, []);
  changeGeneration = true;
  await assert.rejects(api("sessions/original"), /Native owner disconnected/);
  assert.equal(
    checks,
    5,
    "a stale generation cannot refresh current device state",
  );
  await assert.rejects(api("device"), /Computer unavailable/);
  assert.deepEqual(offline, [false]);
});

test("switching Agent does not cancel or discard the device-level online probe", async (context) => {
  const source = await fs.readFile(
    path.resolve(__dirname, "../web/src/transport/api.js"),
    "utf8",
  );
  const { createAPI } = await import(
    "data:text/javascript;base64," + Buffer.from(source).toString("base64")
  );
  const previousWindow = global.window,
    previousFetch = global.fetch;
  context.after(() => {
    global.window = previousWindow;
    global.fetch = previousFetch;
  });
  let agent = "codex",
    resolveDevice,
    signal;
  global.window = { RemoteSecure: {} };
  global.fetch = async (path, init) => {
    signal = init.signal;
    return new Promise((resolve) => {
      resolveDevice = resolve;
    });
  };
  const { api, cancelAPI } = createAPI({
    state: { generation: 1, live: {} },
    getAgent: () => ({ id: agent }),
    actionCapability: () => "",
  });
  const pending = api("device");
  agent = "claude-desktop";
  cancelAPI();
  assert.equal(signal.aborted, false);
  resolveDevice(
    new Response(JSON.stringify({ id: "device", online: true }), {
      status: 200,
    }),
  );
  assert.equal((await pending).online, true);
});

test("an unavailable Agent blocks only its own reads and mutations while discovery remains device scoped", async (context) => {
  const source = await fs.readFile(
    path.resolve(__dirname, "../web/src/transport/api.js"),
    "utf8",
  );
  const { createAPI } = await import(
    "data:text/javascript;base64," + Buffer.from(source).toString("base64")
  );
  const previous = global.window;
  context.after(() => {
    global.window = previous;
  });
  let agent = "claude-desktop";
  const calls = [],
    state = {
      generation: 1,
      live: {},
      agents: [
        { id: agent, state: "unavailable", problem: "Desktop unavailable" },
        { id: "codex", state: "connected" },
      ],
    };
  global.window = {
    RemoteSecure: {
      fetch: async (path, init) => {
        calls.push({ path, init });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    },
  };
  const { api } = createAPI({
    state,
    getAgent: () => ({ id: agent }),
    actionCapability: () => "",
  });
  for (const path of ["sessions", "options", "threads/original/turn"])
    await assert.rejects(
      api(path, path.endsWith("/turn") ? { text: "must stay" } : undefined),
      /Desktop unavailable/,
    );
  assert.equal(calls.length, 0);
  await api("agents");
  assert.equal(calls[0].init.headers["X-Remote-Agent"], undefined);
  agent = "codex";
  await api("sessions");
  assert.equal(calls[1].init.headers["X-Remote-Agent"], "codex");
  agent = "claude-desktop";
  delete state.agents[0].state;
  await api("sessions");
  assert.equal(calls[2].init.headers["X-Remote-Agent"], "claude-desktop");
});
