const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
const { chromium, webkit } = require("playwright");
const { encryptedFixture } = require("./e2ee-fixture.cjs");

const assets = path.resolve(__dirname, "../internal/relay/assets");
const engines = process.env.BROWSER
  ? [process.env.BROWSER]
  : ["chromium", "webkit"];
const descriptors = [
  { id: "codex", name: "Codex" },
  { id: "claude-desktop", name: "Claude Desktop" },
];
const projects = {
  codex: "/fixture/codex",
  "claude-desktop": "/fixture/desktop",
};
const rowFor = (agent) => ({
  id: agent + "-original",
  title: agent === "codex" ? "Codex original" : "Desktop original",
  cwd: projects[agent],
  source: agent === "codex" ? "codex-app" : agent,
  last: "2026-10-26T00:00:00Z",
});
const baseOptions = (agent) => ({
  model: agent === "codex" ? "codex-main" : "desktop-model",
  effort: "high",
  mode: "default",
  permission: agent === "codex" ? "default" : "auto",
});
const owner = (agent) => ({
  kind: "native",
  state: "connected",
  epoch: agent + "-owner",
  capabilities: {
    send: true,
    answer: true,
    configure: true,
    interrupt: false,
    steer: false,
  },
});
function catalog(agent) {
  return {
    agent: descriptors.find((value) => value.id === agent),
    defaults: baseOptions(agent),
    ...(agent === "claude-desktop"
      ? {
          creation_default_permission: "auto",
          creation_permissions: ["auto", "default"],
        }
      : {}),
    models:
      agent === "codex"
        ? [
            {
              id: "codex-main",
              model: "codex-main",
              displayName: "Codex Main",
              name: "Codex Main",
              is_default: true,
              supportedReasoningEfforts: [{ reasoningEffort: "high" }],
              defaultReasoningEffort: "high",
            },
          ]
        : [
            {
              id: "desktop-model",
              name: "Desktop Model",
              is_default: true,
              reasoning_efforts: [{ reasoningEffort: "high" }],
              default_effort: "high",
            },
            {
              id: "desktop-manual",
              name: "Desktop Manual",
              reasoning_efforts: [{ reasoningEffort: "high" }],
              default_effort: "high",
            },
          ],
    modes: [{ name: "Default", mode: "default" }],
    permissions:
      agent === "claude-desktop"
        ? [
            { id: "auto", name: "Auto", available: true },
            { id: "default", name: "Manual", available: true },
          ]
        : [{ id: "default", name: "Ask for approval", available: true }],
    skills: [],
    tools: [],
    capabilities: {
      background_creation: true,
      creation_request_id: true,
      creation_default_permissions_only: false,
      queue: false,
      attachments: true,
    },
  };
}
async function fixture(t, engine, config = {}) {
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  t.after(() => browser.close());
  const page = await browser.newPage({
    viewport: { width: config.width || 1280, height: 900 },
    locale: "en-US",
  });
  page.setDefaultTimeout(10000);
  if (config.clock) await page.clock.install();
  if (config.theme)
    await page.addInitScript(
      (theme) => localStorage.setItem("codex.remote.theme", theme),
      config.theme,
    );
  await encryptedFixture(page, { paired: true });
  const errors = [],
    seen = [],
    state = {
      online: config.online !== false,
      agents: (config.agents || descriptors).map((agent) => ({ ...agent })),
      defaultAgent: config.defaultAgent || "codex",
      agentError: config.agentError || 0,
      listError: config.listError || 0,
      createError: config.createError || 0,
      detailError: 0,
      optionsError: 0,
      holdList: null,
      holdDetail: null,
      holdInventory: null,
      created: {},
      selectedOptions: { ...config.selectedOptions },
      released: 0,
    };
  page.on("pageerror", (error) => errors.push(error.message));
  const release = (kind) => {
    const pending = state[kind];
    state[kind] = null;
    pending?.resolve();
  };
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      agent = request.headers()["x-remote-agent"] || "codex",
      data = request.postData() ? request.postDataJSON() : undefined;
    if (url.pathname.startsWith("/api/")) {
      seen.push({
        path: url.pathname,
        query: url.search,
        agent,
        headers: request.headers(),
        method: request.method(),
        data,
      });
      if (url.pathname === "/api/device")
        return route.fulfill({
          json: {
            id: "fixture-device",
            name: "Test computer",
            online: state.online,
          },
        });
      if (url.pathname === "/api/agents")
        return route.fulfill(
          state.agentError
            ? {
                status: state.agentError,
                json: { error: "Agent discovery failed" },
              }
            : {
                json: {
                  agents: state.agents,
                  default_agent: state.defaultAgent,
                },
              },
        );
      if (url.pathname === "/api/options") {
        if (state.optionsError)
          return route.fulfill({
            status: state.optionsError,
            json: { error: "Options read failed" },
          });
        const options = catalog(agent),
          selected = state.selectedOptions[url.searchParams.get("thread")];
        if (config.controlsOptions && agent === "codex") {
          options.capabilities.controls_options = true;
          if (url.searchParams.get("scope") === "controls") {
            delete options.skills;
            delete options.tools;
          } else if (url.searchParams.has("thread") && state.holdInventory)
            await new Promise((resolve) => {
              state.holdInventory.resolve = resolve;
            });
        }
        if (selected) options.defaults = { ...selected };
        return route.fulfill({ json: options });
      }
      if (url.pathname === "/api/sessions") {
        if (state.holdList?.agent === agent) {
          await new Promise((resolve) => {
            state.holdList.resolve = resolve;
          });
          state.released++;
        }
        try {
          return await route.fulfill(
            state.listError
              ? {
                  status: state.listError,
                  json: { error: "Session list failed" },
                }
              : {
                  json: {
                    sessions: [
                      rowFor(agent),
                      ...Object.values(state.created).filter(
                        (row) =>
                          row.source ===
                          (agent === "codex" ? "codex-app" : agent),
                      ),
                    ],
                    projects: [projects[agent]],
                    has_more: false,
                  },
                },
          );
        } catch {
          return;
        }
      }
      if (
        url.pathname.startsWith("/api/sessions/") &&
        !url.pathname.slice("/api/sessions/".length).includes("/")
      ) {
        if (state.detailError)
          return route.fulfill({
            status: state.detailError,
            json: { error: "Detail read failed" },
          });
        if (state.holdDetail?.agent === agent) {
          await new Promise((resolve) => {
            state.holdDetail.resolve = resolve;
          });
          state.released++;
        }
        const id = decodeURIComponent(url.pathname.split("/").at(-1)),
          row = state.created[id] || rowFor(agent);
        try {
          return await route.fulfill({
            json: {
              session: row,
              options: state.selectedOptions[id] || baseOptions(agent),
              history_items: [],
              history_has_more: false,
              live: {
                status: "idle",
                items: [],
                requests: [],
                options: state.selectedOptions[id] || baseOptions(agent),
                owner: owner(agent),
              },
            },
          });
        } catch {
          return;
        }
      }
      if (url.pathname === "/api/threads" && request.method() === "POST") {
        if (state.createError)
          return route.fulfill({
            status: state.createError,
            json: { error: "Creation result unknown" },
          });
        const row = {
          ...rowFor(agent),
          id: agent + "-created",
          title: agent + " created",
        };
        state.created[row.id] = row;
        state.selectedOptions[row.id] = {
          ...baseOptions(agent),
          ...Object.fromEntries(
            ["model", "effort", "mode", "permission"]
              .filter((key) => data[key] !== undefined)
              .map((key) => [key, data[key]]),
          ),
        };
        return route.fulfill({ json: row });
      }
      if (url.pathname.endsWith("/owner"))
        return route.fulfill({ json: { owner: owner(agent) } });
      if (url.pathname.endsWith("/settings")) {
        const id = decodeURIComponent(url.pathname.split("/").at(-2));
        state.selectedOptions[id] = {
          ...baseOptions(agent),
          ...state.selectedOptions[id],
          ...data,
        };
        return route.fulfill({ json: { options: state.selectedOptions[id] } });
      }
      if (url.pathname.endsWith("/changes"))
        return route.fulfill({ json: { changes: [], pending: false } });
      if (url.pathname.endsWith("/plan"))
        return route.fulfill({ json: { pending_plan: null } });
      if (url.pathname.endsWith("/queue"))
        return route.fulfill({
          json: { queue: [], known: true, revision: 0, paused: false },
        });
      if (url.pathname.endsWith("/agents"))
        return route.fulfill({ json: { agents: [] } });
      if (url.pathname.endsWith("/events"))
        return route.fulfill({
          contentType: "text/event-stream",
          body: ": fixture\n\n",
        });
      return route.fulfill({
        status: 404,
        json: { error: "Unknown fixture API: " + url.pathname },
      });
    }
    const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    try {
      return route.fulfill({
        body: await fs.readFile(path.join(assets, name)),
        contentType: {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
        }[path.extname(name)],
      });
    } catch {
      return route.fulfill({ status: 404 });
    }
  });
  await page.goto("https://remote.test/?locale=en");
  await page.locator("#workspace:visible").waitFor();
  if (config.width && config.width < 760)
    await page.locator("#sidebarToggle").click();
  if (!config.agentError && !config.listError && state.online) {
    const connected = (agent) => !agent.state || agent.state === "connected",
      initial =
        state.agents.find(
          (agent) => agent.id === state.defaultAgent && connected(agent),
        ) || state.agents.find(connected);
    if (initial)
      await page
        .locator('#sessions button[data-id="' + initial.id + '-original"]')
        .waitFor();
  }
  return { page, seen, state, errors, release };
}
async function chooseAgent(page, agent) {
  await page.locator("#agentSelect").selectOption(agent);
  await page
    .locator('#sessions button[data-id="' + agent + '-original"]')
    .waitFor();
  await page.waitForFunction(() => !document.querySelector("#model").disabled);
}
async function chooseModel(page, name) {
  await page.locator("#model").click();
  await page.locator("#reasoningModel").click();
  await page
    .locator('#menu [role="menuitemradio"]')
    .filter({ hasText: name })
    .click();
  await page.locator("#model").filter({ hasText: name }).waitFor();
}
const connectedDescriptors = () =>
  descriptors.map((agent) => ({ ...agent, state: "connected" }));
const agentCalls = (seen, id) =>
  seen.filter(
    (value) =>
      value.headers["x-remote-agent"] === id &&
      !["/api/device", "/api/logout", "/api/agents"].includes(value.path),
  );
async function discoverOnFocus(page, state) {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction((expected) => {
    const options = [...document.querySelector("#agentSelect").options];
    return expected.every((agent) =>
      options
        .find((option) => option.value === agent.id)
        ?.textContent.includes(
          {
            connected: "Connected",
            connecting: "Connecting",
            disconnected: "Disconnected",
            unavailable: "Unavailable",
          }[agent.state],
        ),
    );
  }, state.agents);
}
function assertNoLifecycleWrites(seen) {
  assert.equal(seen.filter((value) => value.method !== "GET").length, 0);
  assert.equal(
    seen.filter((value) => /\/(?:connect|start)(?:[/?]|$)/.test(value.path))
      .length,
    0,
  );
}
for (const engine of engines) {
  test(
    engine +
      ": native control settings are ready while supplemental inventory is held",
    async (t) => {
      const { page, state, seen, errors, release } = await fixture(t, engine, {
        controlsOptions: true,
      });
      await page.waitForFunction(
        () => !document.querySelector("#model").disabled,
      );
      state.holdInventory = {};
      await page.locator('#sessions button[data-id="codex-original"]').click();
      await page.waitForFunction(() =>
        document.querySelector("#title").textContent.includes("Codex original"),
      );
      await page.waitForFunction(
        () => !document.querySelector("#model").disabled,
      );
      assert.equal(typeof state.holdInventory?.resolve, "function");
      for (const id of ["model", "effort", "mode", "permission"])
        assert(await page.locator("#" + id).isEnabled());
      const controlsRead = seen.find(
        (call) =>
          call.path === "/api/options" &&
          new URLSearchParams(call.query).get("thread") === "codex-original" &&
          new URLSearchParams(call.query).get("scope") === "controls",
      );
      assert(controlsRead);
      await page.locator("#mode").click();
      await page.locator('#menu [role="menuitemradio"]').first().click();
      await page.waitForFunction(
        () => !document.querySelector("#mode").disabled,
      );
      assert.deepEqual(
        seen.find((call) => call.path.endsWith("/settings")).data,
        { mode: "default" },
      );
      release("holdInventory");
      assert.deepEqual(errors, []);
    },
  );
  for (const failedState of ["connecting", "disconnected", "unavailable"])
    test(
      engine +
        ": a " +
        failedState +
        " Desktop slot stays isolated from healthy Codex",
      async (t) => {
        const problem = "Fixture Desktop " + failedState,
          agents = connectedDescriptors();
        agents[1] = { ...agents[1], state: failedState, problem };
        const { page, seen, errors } = await fixture(t, engine, { agents });
        assert.equal(await page.locator("#agentSelect").inputValue(), "codex");
        assert.equal(
          await page
            .locator("#agentConnectionStatus")
            .getAttribute("data-state"),
          "connected",
        );
        await page
          .locator('#sessions button[data-id="codex-original"]')
          .click();
        await page.waitForFunction(() =>
          document
            .querySelector("#title")
            .textContent.includes("Codex original"),
        );
        await page.locator("#message").fill("Healthy Codex draft");
        assert(!(await page.locator("#send").isDisabled()));
        const priorDesktopCalls = agentCalls(seen, "claude-desktop").length;
        await page.locator("#agentSelect").selectOption("claude-desktop");
        await page
          .locator("#agentConnectionStatus")
          .filter({ hasText: problem })
          .waitFor();
        assert.equal(
          await page
            .locator("#agentConnectionStatus")
            .getAttribute("data-state"),
          failedState,
        );
        assert.equal(
          await page
            .locator('#agentSelect option[value="claude-desktop"]')
            .textContent(),
          "Claude Desktop · " +
            {
              connecting: "Connecting…",
              disconnected: "Disconnected",
              unavailable: "Unavailable",
            }[failedState],
        );
        assert.equal(
          await page.locator("#agentSelect").inputValue(),
          "claude-desktop",
        );
        assert(await page.locator("#new").isDisabled());
        assert(await page.locator("#send").isDisabled());
        await page.locator("#refresh").click();
        assert.equal(
          agentCalls(seen, "claude-desktop").length,
          priorDesktopCalls,
        );
        await chooseAgent(page, "codex");
        assert.equal(
          await page.locator("#message").inputValue(),
          "Healthy Codex draft",
        );
        assert(!(await page.locator("#send").isDisabled()));
        assert(await page.locator("#deviceOffline").isHidden());
        assertNoLifecycleWrites(seen);
        assert.deepEqual(errors, []);
      },
    );
  test(
    engine + ": a failed initial default selects the connected peer",
    async (t) => {
      const agents = connectedDescriptors();
      agents[1] = {
        ...agents[1],
        state: "unavailable",
        problem: "Desktop startup failed",
      };
      const { page, seen, errors } = await fixture(t, engine, {
        agents,
        defaultAgent: "claude-desktop",
      });
      assert.equal(await page.locator("#agentSelect").inputValue(), "codex");
      assert.equal(agentCalls(seen, "claude-desktop").length, 0);
      assert.match(
        await page
          .locator('#agentSelect option[value="claude-desktop"]')
          .innerText(),
        /Unavailable/,
      );
      assertNoLifecycleWrites(seen);
      assert.deepEqual(errors, []);
    },
  );
  test(
    engine +
      ": all failed Agent slots remain selectable without claiming the computer is offline",
    async (t) => {
      const agents = [
        {
          ...descriptors[0],
          state: "disconnected",
          problem: "Codex is switched off",
        },
        {
          ...descriptors[1],
          state: "unavailable",
          problem: "Desktop failed locally",
        },
      ];
      const { page, seen, errors } = await fixture(t, engine, {
        agents,
        defaultAgent: "claude-desktop",
      });
      await page
        .locator("#agentConnectionStatus")
        .filter({ hasText: "Desktop failed locally" })
        .waitFor();
      assert.equal(
        await page.locator("#agentSelect").inputValue(),
        "claude-desktop",
      );
      assert(await page.locator("#new").isDisabled());
      assert(await page.locator("#deviceOffline").isHidden());
      assert.equal(
        agentCalls(seen, "codex").length +
          agentCalls(seen, "claude-desktop").length,
        0,
      );
      await page.locator("#agentSelect").selectOption("codex");
      await page
        .locator("#agentConnectionStatus")
        .filter({ hasText: "Codex is switched off" })
        .waitFor();
      await page.locator("#refresh").click();
      assert.equal(
        agentCalls(seen, "codex").length +
          agentCalls(seen, "claude-desktop").length,
        0,
      );
      assertNoLifecycleWrites(seen);
      assert.deepEqual(errors, []);
    },
  );
  test(
    engine +
      ": a healthy Agent status refresh reads one list and no duplicate options or detail",
    async (t) => {
      const { page, seen, state, errors } = await fixture(t, engine, {
        agents: connectedDescriptors(),
      });
      await page.locator('#sessions button[data-id="codex-original"]').click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#title")
            .textContent.includes("Codex original") &&
          !document.querySelector("#model").disabled,
      );
      await page.waitForTimeout(100);
      const before = seen.length,
        response = page.waitForResponse(
          (value) => new URL(value.url()).pathname === "/api/sessions",
        );
      state.agents[1] = {
        ...state.agents[1],
        state: "connecting",
        problem: "Desktop is reconnecting",
      };
      await discoverOnFocus(page, state);
      await response;
      await page.waitForTimeout(50);
      const reads = seen.slice(before);
      assert.equal(
        reads.filter((value) => value.path === "/api/sessions").length,
        1,
      );
      assert.equal(
        reads.filter(
          (value) =>
            value.path === "/api/options" ||
            value.path === "/api/sessions/codex-original",
        ).length,
        0,
      );
      assertNoLifecycleWrites(seen);
      assert.deepEqual(errors, []);
    },
  );
  test(
    engine +
      ": focus refresh preserves the active Desktop ID and draft through failure and recovery",
    async (t) => {
      const { page, seen, state, errors } = await fixture(t, engine, {
        agents: connectedDescriptors(),
      });
      await chooseAgent(page, "claude-desktop");
      await page
        .locator('#sessions button[data-id="claude-desktop-original"]')
        .click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#title")
            .textContent.includes("Desktop original") &&
          !document.querySelector("#message").disabled,
      );
      await page.locator("#message").fill("Keep original Desktop draft");
      state.agents[1] = {
        ...state.agents[1],
        state: "unavailable",
        problem: "Original Desktop connection lost",
      };
      await discoverOnFocus(page, state);
      await page
        .locator("#agentConnectionStatus")
        .filter({ hasText: "Original Desktop connection lost" })
        .waitFor();
      assert.equal(
        await page.locator("#agentSelect").inputValue(),
        "claude-desktop",
      );
      assert.equal(
        await page
          .locator('#sessions button[data-id="claude-desktop-original"]')
          .getAttribute("aria-current"),
        "true",
      );
      assert.equal(
        await page.locator("#message").inputValue(),
        "Keep original Desktop draft",
      );
      assert(await page.locator("#send").isDisabled());
      assert(await page.locator("#new").isDisabled());
      const failedCalls = agentCalls(seen, "claude-desktop").length;
      await page.locator("#refresh").click();
      assert.equal(agentCalls(seen, "claude-desktop").length, failedCalls);
      state.agents[1] = { ...descriptors[1], state: "connected" };
      await discoverOnFocus(page, state);
      await page.waitForFunction(
        () => !document.querySelector("#send").disabled,
      );
      assert.equal(
        await page
          .locator('#sessions button[data-id="claude-desktop-original"]')
          .getAttribute("aria-current"),
        "true",
      );
      assert.equal(
        await page.locator("#message").inputValue(),
        "Keep original Desktop draft",
      );
      assert(agentCalls(seen, "claude-desktop").length > failedCalls);
      assert.equal(
        await page.locator("#agentConnectionStatus").textContent(),
        "Connected",
      );
      assertNoLifecycleWrites(seen);
      assert.deepEqual(errors, []);
    },
  );
  test(
    engine + ": the periodic device check refreshes independent Agent status",
    async (t) => {
      const { page, seen, state, errors } = await fixture(t, engine, {
        agents: connectedDescriptors(),
        clock: true,
      });
      await page.locator("#message").fill("Draft survives periodic status");
      const initial = seen.filter(
        (value) => value.path === "/api/agents",
      ).length;
      state.agents[1] = {
        ...state.agents[1],
        state: "disconnected",
        problem: "Desktop toggle off",
      };
      await page.clock.fastForward(10000);
      await page
        .locator('#agentSelect option[value="claude-desktop"]')
        .filter({ hasText: "Disconnected" })
        .waitFor({ state: "attached" });
      assert(
        seen.filter((value) => value.path === "/api/agents").length > initial,
      );
      assert.equal(await page.locator("#agentSelect").inputValue(), "codex");
      assert.equal(
        await page.locator("#message").inputValue(),
        "Draft survives periodic status",
      );
      assertNoLifecycleWrites(seen);
      assert.deepEqual(errors, []);
    },
  );
  test(
    engine +
      ": refreshing a failed Desktop peer leaves selected Codex and its draft intact",
    async (t) => {
      const { page, seen, state, errors } = await fixture(t, engine, {
        agents: connectedDescriptors(),
      });
      await page.locator('#sessions button[data-id="codex-original"]').click();
      await page.waitForFunction(() =>
        document.querySelector("#title").textContent.includes("Codex original"),
      );
      await page.locator("#message").fill("Codex survives peer failure");
      state.agents[1] = {
        ...state.agents[1],
        state: "unavailable",
        problem: "Peer startup failed",
      };
      await discoverOnFocus(page, state);
      assert.equal(await page.locator("#agentSelect").inputValue(), "codex");
      assert.equal(
        await page
          .locator('#sessions button[data-id="codex-original"]')
          .getAttribute("aria-current"),
        "true",
      );
      assert.equal(
        await page.locator("#message").inputValue(),
        "Codex survives peer failure",
      );
      assert(!(await page.locator("#send").isDisabled()));
      assert.equal(agentCalls(seen, "claude-desktop").length, 0);
      assertNoLifecycleWrites(seen);
      assert.deepEqual(errors, []);
    },
  );
  test(
    engine +
      ": 390px Agent selection remains visible and usable in dark and light themes",
    async (t) => {
      for (const theme of ["dark", "light"]) {
        const { page, errors } = await fixture(t, engine, {
          width: 390,
          theme,
        });
        assert.equal(
          await page.evaluate(() =>
            document.documentElement.classList.contains("dark"),
          ),
          theme === "dark",
        );
        const selector = page.locator("#agentSelect");
        await page.waitForFunction(
          () =>
            document.querySelector("#agentSelect").getBoundingClientRect()
              .left >= 0,
        );
        const box = await selector.boundingBox();
        assert(
          box &&
            box.x >= 0 &&
            box.y >= 0 &&
            box.x + box.width <= 390 &&
            box.y + box.height <= 900,
          JSON.stringify({ theme, box }),
        );
        assert.deepEqual(await selector.locator("option").allTextContents(), [
          "Codex",
          "Claude Desktop",
        ]);
        await page
          .locator("#navBackdrop")
          .click({ position: { x: 380, y: 500 } });
        await page.locator("#message").fill("Phone Codex draft " + theme);
        await page.locator("#sidebarToggle").click();
        await chooseAgent(page, "claude-desktop");
        assert.equal(
          await selector.locator("option:checked").textContent(),
          "Claude Desktop",
        );
        assert.equal(
          await page.locator("#activeAgentName").innerText(),
          "Claude Desktop",
        );
        assert.equal(
          await page.locator("#executionAgentName").innerText(),
          "Claude Desktop",
        );
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "the Agent drawer must fit the phone viewport",
        );
        if (process.env.ARTIFACT_DIR) {
          await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
          await page.screenshot({
            path: path.join(
              process.env.ARTIFACT_DIR,
              `mobile-claude-${theme}-${engine}.png`,
            ),
            animations: "disabled",
          });
        }
        await chooseAgent(page, "codex");
        assert.equal(
          await page.locator("#activeAgentName").innerText(),
          "Codex",
        );
        await page
          .locator("#navBackdrop")
          .click({ position: { x: 380, y: 500 } });
        assert.equal(
          await page.locator("#message").inputValue(),
          "Phone Codex draft " + theme,
        );
        assert.deepEqual(errors, []);
        await page.close();
      }
    },
  );
  test(
    engine +
      ": existing Desktop Manual settings stay Manual despite the Auto creation default",
    async (t) => {
      const existing = {
        ...baseOptions("claude-desktop"),
        permission: "default",
      };
      const { page, seen, errors } = await fixture(t, engine, {
        selectedOptions: { "claude-desktop-original": existing },
      });
      await chooseAgent(page, "claude-desktop");
      await page
        .locator('#sessions button[data-id="claude-desktop-original"]')
        .click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#title")
            .textContent.includes("Desktop original") &&
          !document.querySelector("#permission").disabled,
      );
      assert.match(
        await page.locator("#permission").innerText(),
        /Manual|default/,
      );
      await page.locator("#permission").click();
      assert.equal(
        await page
          .locator('#menu [role="menuitemradio"]')
          .filter({ hasText: "Manual" })
          .getAttribute("aria-checked"),
        "true",
      );
      await page.keyboard.press("Escape");
      assert.equal(
        seen.filter(
          (value) => value.method !== "GET" && value.path.endsWith("/settings"),
        ).length,
        0,
      );
      assert.deepEqual(errors, []);
    },
  );
  test(
    engine +
      ": explicit Agent selection routes encrypted calls and restores isolated drafts and models",
    async (t) => {
      const { page, seen, errors } = await fixture(t, engine);
      assert.deepEqual(
        await page.locator("#agentSelect option").allTextContents(),
        ["Codex", "Claude Desktop"],
      );
      assert(await page.locator("#agentConnectionStatus").isHidden());
      assert.equal(await page.locator("#agentSelect").inputValue(), "codex");
      assert(
        seen
          .filter((value) => value.path === "/api/agents")
          .every((value) => !Object.hasOwn(value.headers, "x-remote-agent")),
      );
      await page.locator("#message").fill("Codex draft");
      await chooseAgent(page, "claude-desktop");
      assert.equal(await page.locator("#message").inputValue(), "");
      await chooseModel(page, "Desktop Manual");
      await page.locator("#message").fill("Desktop draft");
      await chooseAgent(page, "codex");
      assert.equal(await page.locator("#message").inputValue(), "Codex draft");
      await chooseAgent(page, "claude-desktop");
      assert.equal(
        await page.locator("#message").inputValue(),
        "Desktop draft",
      );
      assert.match(await page.locator("#model").innerText(), /Desktop Manual/);
      for (const agent of ["codex", "claude-desktop"]) {
        assert(
          seen.some(
            (value) =>
              value.path === "/api/sessions" &&
              value.headers["x-remote-agent"] === agent,
          ),
        );
        assert(
          seen.some(
            (value) =>
              value.path === "/api/options" &&
              value.headers["x-remote-agent"] === agent,
          ),
        );
      }
      assert.deepEqual(errors, []);
    },
  );
  for (const kind of ["holdList", "holdDetail"])
    test(
      engine +
        ": a late previous-Agent " +
        (kind === "holdList" ? "list" : "detail") +
        " cannot overwrite the selected Agent",
      async (t) => {
        const { page, state, errors, release } = await fixture(t, engine);
        state[kind] = { agent: "codex" };
        if (kind === "holdList") await page.locator("#refresh").click();
        else
          await page
            .locator('#sessions button[data-id="codex-original"]')
            .click();
        for (let tries = 0; !state[kind].resolve && tries < 100; tries++)
          await page.waitForTimeout(10);
        assert(
          state[kind].resolve,
          "the delayed fixture request did not arrive",
        );
        await chooseAgent(page, "claude-desktop");
        await page.locator("#message").fill("Current Desktop draft");
        release(kind);
        await page.waitForTimeout(100);
        assert.equal(
          await page.locator("#agentSelect").inputValue(),
          "claude-desktop",
        );
        assert.equal(
          await page
            .locator('#sessions button[data-id="codex-original"]')
            .count(),
          0,
        );
        assert.equal(
          await page.locator("#message").inputValue(),
          "Current Desktop draft",
        );
        assert.doesNotMatch(
          await page.locator("#title").innerText(),
          /Codex original/,
        );
        assert.equal(state.released, 1);
        assert.deepEqual(errors, []);
      },
    );
  for (const error of ["agentError", "listError"])
    test(
      engine + ": an online device stays online after " + error + " 503",
      async (t) => {
        const { page, errors } = await fixture(t, engine, { [error]: 503 });
        await page
          .locator("#notice")
          .filter({
            hasText:
              error === "agentError"
                ? "Agent discovery failed"
                : "Session list failed",
          })
          .waitFor();
        assert(await page.locator("#deviceOffline").isHidden());
        assert.doesNotMatch(
          await page.locator("#connectionLabel").innerText(),
          /offline|unknown/i,
        );
        assert.deepEqual(errors, []);
      },
    );
  for (const error of ["detailError", "optionsError"])
    test(
      engine +
        ": an online device stays online after " +
        error +
        " 503 without replaying actions",
      async (t) => {
        const { page, seen, state, errors } = await fixture(t, engine);
        state[error] = 503;
        await page
          .locator('#sessions button[data-id="codex-original"]')
          .click();
        await page
          .locator("#notice")
          .filter({
            hasText:
              error === "detailError"
                ? "Detail read failed"
                : "Options read failed",
          })
          .waitFor();
        for (
          let tries = 0;
          seen.filter((value) => value.path === "/api/device").length < 2 &&
          tries < 100;
          tries++
        )
          await page.waitForTimeout(10);
        assert(
          seen.filter((value) => value.path === "/api/device").length >= 2,
          "the actual device status was not rechecked",
        );
        assert(await page.locator("#deviceOffline").isHidden());
        assert.doesNotMatch(
          await page.locator("#connectionLabel").innerText(),
          /computer.*offline/i,
        );
        assert.equal(seen.filter((value) => value.method !== "GET").length, 0);
        assert.deepEqual(errors, []);
      },
    );
  test(
    engine + ": a genuine device offline response remains visible",
    async (t) => {
      const { page, seen, errors } = await fixture(t, engine, {
        online: false,
      });
      await page.locator("#deviceOffline:visible").waitFor();
      assert.match(
        await page.locator("#connectionLabel").innerText(),
        /offline/i,
      );
      assert.equal(
        seen.filter((value) => value.path === "/api/agents").length,
        0,
      );
      assert.deepEqual(errors, []);
    },
  );
  test(
    engine + ": uncertain creation retries reuse only their own Agent UUID",
    async (t) => {
      const { page, seen, errors } = await fixture(t, engine, {
        createError: 500,
      });
      const attempt = async () => {
        const response = page.waitForResponse(
          (value) => new URL(value.url()).pathname === "/api/threads",
        );
        await page.locator("#new").click();
        await response;
        await page
          .locator("#notice")
          .filter({ hasText: "Creation result unknown" })
          .waitFor();
        await page.waitForFunction(
          () => !document.querySelector("#new").disabled,
        );
      };
      await attempt();
      await chooseAgent(page, "claude-desktop");
      await attempt();
      await chooseAgent(page, "codex");
      await attempt();
      const creates = seen.filter(
        (value) => value.path === "/api/threads" && value.method === "POST",
      );
      assert.equal(creates.length, 3);
      assert.deepEqual(
        creates.map((value) => value.agent),
        ["codex", "claude-desktop", "codex"],
      );
      assert.equal(creates[0].data.request_id, creates[2].data.request_id);
      assert.notEqual(creates[0].data.request_id, creates[1].data.request_id);
      assert.deepEqual(errors, []);
    },
  );
  for (const manual of [false, true])
    test(
      engine +
        ": Desktop new drafts use Auto and preserve " +
        (manual ? "explicit Manual" : "default Auto") +
        " at creation",
      async (t) => {
        const { page, seen, errors } = await fixture(t, engine);
        await chooseAgent(page, "claude-desktop");
        assert.match(
          await page.locator("#permission").innerText(),
          /Auto|auto/,
        );
        if (manual) {
          await page.locator("#permission").click();
          await page
            .locator('#menu [role="menuitemradio"]')
            .filter({ hasText: "Manual" })
            .click();
        }
        await chooseModel(page, "Desktop Manual");
        await page.locator("#new").click();
        await page.waitForFunction(() =>
          document
            .querySelector("#title")
            .textContent.includes("claude-desktop created"),
        );
        const created = seen.find(
          (value) => value.path === "/api/threads" && value.method === "POST",
        );
        assert(created);
        assert.equal(created.headers["x-remote-agent"], "claude-desktop");
        assert.equal(created.data.model, "desktop-manual");
        assert.equal(created.data.permission, manual ? "default" : "auto");
        assert.match(created.data.request_id, /^[a-f0-9-]{36}$/);
        assert.match(
          await page.locator("#model").innerText(),
          /Desktop Manual/,
        );
        assert.deepEqual(errors, []);
      },
    );
}
