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
for (const engine of engines)
  for (const locale of ["en", "zh", "zh-TW", "ja", "de"])
    test(
      engine +
        " " +
        locale +
        ": first history selection controls do not wait for history or MCP inventory",
      async (t) => {
        const browser = await { chromium, webkit }[engine].launch();
        const page = await browser.newPage({
          viewport: { width: 1280, height: 900 },
        });
        await encryptedFixture(page, { paired: true });
        const calls = [],
          errors = [];
        let release;
        const held = new Promise((resolve) => {
          release = resolve;
        });
        t.after(async () => {
          release();
          await browser.close();
        });
        page.on("pageerror", (error) => errors.push(error.message));
        const capabilities = {
          controls_options: true,
          connection_metadata: true,
        };
        const row = {
          id: "cold-native",
          title: "Cold original conversation",
          cwd: "/fixture/project",
          source: "codex-app",
          last: "2026-10-26T00:00:00Z",
        };
        const options = {
          model: "fixture-model",
          effort: "high",
          mode: "default",
          permission: "workspace-write",
        };
        const live = {
          status: "idle",
          items: [],
          requests: [],
          options,
          owner: {
            kind: "native",
            state: "connected",
            epoch: "original-epoch",
            capabilities: {
              send: true,
              configure: true,
              background_connect: true,
            },
          },
        };
        const catalog = {
          agent: { id: "codex", name: "Codex" },
          capabilities,
          defaults: options,
          models: [
            {
              id: "fixture-model",
              model: "fixture-model",
              displayName: "Fixture Model",
              supportedReasoningEfforts: [{ reasoningEffort: "high" }],
              defaultReasoningEffort: "high",
            },
          ],
          modes: [{ mode: "default", name: "Default" }],
          permissions: [],
        };
        await page.route("**/*", async (route) => {
          const request = route.request(),
            url = new URL(request.url());
          if (url.pathname.startsWith("/api/")) {
            calls.push({
              path: url.pathname,
              scope: url.searchParams.get("scope"),
              method: request.method(),
            });
            if (url.pathname === "/api/device")
              return route.fulfill({
                json: {
                  id: "cold-device",
                  name: "Fixture computer",
                  online: true,
                },
              });
            if (url.pathname === "/api/agents")
              return route.fulfill({
                json: {
                  agents: [{ id: "codex", name: "Codex", state: "connected" }],
                  default_agent: "codex",
                },
              });
            if (url.pathname === "/api/sessions")
              return route.fulfill({
                json: {
                  sessions: [row],
                  projects: [row.cwd],
                  next: 1,
                  has_more: false,
                  capabilities,
                },
              });
            if (url.pathname === "/api/options") {
              if (url.searchParams.get("scope") !== "controls") await held;
              return route.fulfill({ json: catalog }).catch(() => {});
            }
            if (url.pathname === "/api/sessions/" + row.id) {
              if (url.searchParams.get("scope") !== "connection") await held;
              return route
                .fulfill({
                  json: {
                    session: row,
                    live,
                    history_items: [],
                    history_has_more: false,
                  },
                })
                .catch(() => {});
            }
            if (url.pathname.endsWith("/events"))
              return route.fulfill({
                contentType: "text/event-stream",
                body: ": fixture\n\n",
              });
            if (url.pathname.endsWith("/queue"))
              return route.fulfill({
                json: { queue: [], known: true, revision: 0, paused: false },
              });
            if (url.pathname.endsWith("/changes"))
              return route.fulfill({ json: { changes: [], pending: false } });
            if (url.pathname.endsWith("/plan"))
              return route.fulfill({ json: { pending_plan: null } });
            return route.fulfill({
              status: 404,
              json: { error: "Unexpected fixture API" },
            });
          }
          const name =
            url.pathname === "/" ? "index.html" : url.pathname.slice(1);
          if (name === "favicon.ico") return route.fulfill({ status: 204 });
          return route.fulfill({
            body: await fs.readFile(path.join(assets, name)),
            contentType: {
              ".html": "text/html",
              ".js": "text/javascript",
              ".css": "text/css",
            }[path.extname(name)],
          });
        });
        await page.goto("https://cold.test/?locale=" + locale);
        await page.locator('#sessions button[data-id="cold-native"]').click();
        await page.waitForFunction(
          () => !document.querySelector("#model").disabled,
        );
        for (const id of ["model", "effort", "mode", "permission"])
          assert(await page.locator("#" + id).isEnabled());
        await page
          .locator("#message")
          .fill("Keep this draft while inventory loads");
        assert(await page.locator("#send").isEnabled());
        assert(
          calls.some(
            (call) => call.path === "/api/options" && call.scope === "controls",
          ),
        );
        assert(
          calls.some(
            (call) =>
              call.path === "/api/sessions/cold-native" &&
              call.scope === "connection",
          ),
        );
        assert(
          calls.some(
            (call) =>
              call.path === "/api/sessions/cold-native" && call.scope === null,
          ),
        );
        assert.equal(calls.filter((call) => call.method !== "GET").length, 0);
        assert.deepEqual(errors, []);
      },
    );
