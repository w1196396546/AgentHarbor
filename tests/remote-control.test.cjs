const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
const { chromium, webkit } = require("playwright");
const { encryptedFixture, pairCode } = require("./e2ee-fixture.cjs");
const assets = path.resolve(__dirname, "../internal/relay/assets");
const engines = process.env.BROWSER
  ? [process.env.BROWSER]
  : ["chromium", "webkit"];

for (const engine of engines)
  for (const lang of ["zh", "en"])
    for (const width of [390, 1280]) {
      test(`${engine} ${lang} ${width}px: pair, history, project, new turn, approvals, questions and stop`, async (t) => {
        const browser = await (
          engine === "webkit" ? webkit : chromium
        ).launch();
        t.after(() => browser.close());
        const page = await browser.newPage({
          viewport: { width, height: 900 },
          locale: lang === "zh" ? "zh-CN" : "en-US",
        });
        await encryptedFixture(page);
        page.setDefaultTimeout(10000);
        const errors = [],
          posts = [],
          agentHeaders = [],
          project = "C:\\work\\my-project",
          optionThreads = [];
        let paired = false,
          created = false,
          turns = 0;
        let live = { status: "idle", turn_id: "", items: [], requests: [] };
        page.on("pageerror", (e) => errors.push(e.message));
        const old = {
          id: "historical-session",
          title: "Historical conversation",
          cwd: project + "\\nested",
          last: new Date().toISOString(),
        };
        const fresh = {
          id: "remote-session",
          title: "New session",
          cwd: project,
          last: new Date().toISOString(),
        };
        await page.route("**/*", async (route) => {
          const req = route.request(),
            u = new URL(req.url());
          if (u.pathname.startsWith("/api/")) {
            const data = req.postData() ? req.postDataJSON() : {};
            if (u.pathname === "/api/options")
              optionThreads.push(u.searchParams.get("thread"));
            if (req.headers()["x-remote-agent"])
              agentHeaders.push({
                path: u.pathname,
                agent: req.headers()["x-remote-agent"],
              });
            if (req.method() === "POST") posts.push({ path: u.pathname, data });
            assert(
              !u.search.includes("fixture-key"),
              "pairing key in server URL",
            );
            if (u.pathname === "/api/pair") {
              assert.equal(data.key, pairCode);
              paired = true;
              return route.fulfill({ json: { paired: true } });
            }
            if (!paired)
              return route.fulfill({
                status: 401,
                body: "Pair this browser first",
              });
            if (u.pathname === "/api/device")
              return route.fulfill({
                json: {
                  id: "fixture-device",
                  name: "My computer",
                  online: true,
                },
              });
            if (u.pathname === "/api/agents")
              return route.fulfill({
                json: {
                  agents: [{ id: "codex", name: "Codex" }],
                  default_agent: "codex",
                },
              });
            if (u.pathname === "/api/logout") {
              paired = false;
              return route.fulfill({ status: 204 });
            }
            if (u.pathname === "/api/options")
              return route.fulfill({
                json: {
                  models: [],
                  modes: [],
                  skills: [],
                  tools: [],
                  permissions: [],
                  defaults: {},
                  capabilities: { background_creation: true },
                },
              });
            if (u.pathname === "/api/sessions")
              return route.fulfill({
                json: {
                  sessions: created ? [fresh, old] : [old],
                  projects: [project],
                  total: created ? 2 : 1,
                  has_more: false,
                  next: 2,
                },
              });
            if (u.pathname.endsWith("/changes"))
              return route.fulfill({
                json: { changes: [], warning: "", pending: false },
              });
            if (u.pathname.endsWith("/plan"))
              return route.fulfill({ json: { pending_plan: null } });
            if (u.pathname === "/api/sessions/historical-session")
              return route.fulfill({
                json: {
                  session: old,
                  history: {
                    parts: [
                      { role: "user", kind: "text", text: "An old request" },
                      {
                        role: "assistant",
                        kind: "text",
                        text: '<img src=x onerror="window.unsafe=true">',
                      },
                    ],
                  },
                },
              });
            if (u.pathname === "/api/threads") {
              assert.equal(data.project, project);
              created = true;
              return route.fulfill({ json: fresh });
            }
            if (u.pathname === "/api/sessions/remote-session")
              return route.fulfill({
                json: { session: fresh, history: { parts: [] }, live },
              });
            if (u.pathname.endsWith("/turn")) {
              turns++;
              live = {
                status: "inProgress",
                turn_id: "turn-" + turns,
                items: [
                  {
                    id: "answer-" + turns,
                    type: "agentMessage",
                    text: "Working on your project.",
                  },
                ],
                requests:
                  turns === 1
                    ? [
                        {
                          id: 99,
                          method: "item/commandExecution/requestApproval",
                          params: {
                            command: "git status",
                            reason: "Inspect the working tree",
                          },
                        },
                      ]
                    : turns === 2
                      ? [
                          {
                            id: "question",
                            method: "item/tool/requestUserInput",
                            params: {
                              questions: [
                                {
                                  id: "choice",
                                  question: "Which file?",
                                  options: [
                                    {
                                      label: "README.md",
                                      description: "Update the introduction",
                                    },
                                  ],
                                },
                              ],
                            },
                          },
                        ]
                      : [],
              };
              return route.fulfill({ json: { turn_id: live.turn_id } });
            }
            if (u.pathname.endsWith("/answer")) {
              live = {
                ...live,
                status: "completed",
                requests: [],
                items: [
                  {
                    id: "answer-" + turns,
                    type: "agentMessage",
                    text: "Finished.",
                  },
                ],
              };
              return route.fulfill({ json: { answered: true } });
            }
            if (u.pathname.endsWith("/interrupt")) {
              live = { ...live, status: "interrupted", requests: [] };
              return route.fulfill({ json: { interrupt_requested: true } });
            }
            return route.fulfill({
              status: 404,
              json: { error: "Unknown API" },
            });
          }
          const name = u.pathname === "/" ? "index.html" : u.pathname.slice(1);
          try {
            return route.fulfill({
              body: await fs.readFile(path.join(assets, name)),
              contentType: {
                ".html": "text/html",
                ".js": "text/javascript",
                ".css": "text/css",
              }[path.extname(name)],
              headers: {
                "Content-Security-Policy":
                  "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'",
              },
            });
          } catch {
            return route.fulfill({ status: 404 });
          }
        });
        await page.goto("https://remote.test/#key=" + pairCode);
        await page.locator("#workspace:visible").waitFor();
        assert.equal(await page.title(), "anywhereToAgent");
        assert.equal(
          await page.locator(".brand strong").innerText(),
          "anywhereToAgent",
        );
        assert.equal(
          await page
            .locator('.settings-link[href="/account"]')
            .getAttribute("href"),
          "/account",
        );
        assert.equal(
          new URL(page.url()).hash,
          "",
          "pairing key remained in browser history",
        );
        if (width < 760) await page.locator("#sidebarToggle").click();
        await page.locator("#sessions button").click();
        await page.getByText("An old request", { exact: true }).waitFor();
        assert.equal(
          await page.evaluate(() => window.unsafe),
          undefined,
          "transcript became executable HTML",
        );
        if (width < 760) await page.locator("#sidebarToggle").click();
        await page.locator("#project").click();
        await page
          .locator("#projects button")
          .filter({ hasText: project })
          .click();
        const previousOptionCount = optionThreads.length;
        await page.locator("#new").click();
        await page.locator("#composer:visible").waitFor();
        assert.equal(
          optionThreads.at(-1),
          null,
          "new conversation capability check reused the selected session ID",
        );
        assert(optionThreads.length > previousOptionCount);
        await page.locator("#message").fill("Please inspect this project.");
        await page.locator("#send").click();
        await page.locator(".request").waitFor();
        assert(
          agentHeaders.some(
            (header) =>
              header.path === "/api/threads" && header.agent === "codex",
          ),
        );
        assert(
          await page.locator("#send").isDisabled(),
          "message button enabled during a turn",
        );
        if (
          process.env.ARTIFACT_DIR &&
          engine === "chromium" &&
          lang === "zh"
        ) {
          await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
          await page.screenshot({
            path: path.join(process.env.ARTIFACT_DIR, `remote-${width}.png`),
            fullPage: true,
          });
        }
        await page
          .getByRole("button", {
            name: lang === "zh" ? "仅允许此次" : "Approve once",
            exact: true,
          })
          .click();
        await page.getByText("Finished.", { exact: true }).waitFor();
        assert.equal(
          posts.find((p) => p.path.endsWith("/answer")).data.accept,
          true,
        );
        await page.locator("#message").fill("Ask me which file.");
        await page.locator("#send").click();
        await page.locator(".request input[type=radio]").check();
        await page
          .getByRole("button", {
            name: lang === "zh" ? "提交回答" : "Submit answer",
            exact: true,
          })
          .click();
        await page.locator(".request").waitFor({ state: "hidden" });
        assert.deepEqual(
          posts.filter((p) => p.path.endsWith("/answer")).at(-1).data.answers,
          { choice: "README.md" },
        );
        await page.locator("#message").fill("Start another task.");
        await page.locator("#send").click();
        await page.locator("#stop:visible").click();
        await page.locator("#stop").waitFor({ state: "hidden" });
        assert.equal(
          posts.filter((p) => p.path.endsWith("/turn")).length,
          3,
          "messages duplicated",
        );
        assert.equal(
          posts.filter((p) => p.path.endsWith("/interrupt")).length,
          1,
        );
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "horizontal overflow",
        );
        if (width < 760) await page.locator("#sidebarToggle").click();
        await page.locator("#logout").click();
        await page.locator("#pair:visible").waitFor();
        assert.deepEqual(errors, []);
      });
    }
