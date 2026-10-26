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
const project = "/project/native";
const session = {
  id: "desktop-original",
  title: "Desktop original session",
  cwd: project,
  source: "claude-desktop",
  last: "2026-10-25T00:00:00Z",
};
const options = {
  model: "native-model",
  effort: "high",
  permission: "default",
  mode: "default",
};
function owner() {
  return {
    kind: "native",
    state: "connected",
    epoch: "native-owner-epoch",
    capabilities: {
      send: false,
      answer: true,
      configure: false,
      interrupt: false,
      steer: false,
      queue: false,
      queue_add: true,
      queue_cancel: true,
      queue_reorder: true,
      queue_edit: false,
      queue_resume: false,
      plan: true,
    },
  };
}
async function fixture(
  t,
  engine,
  {
    width = 1280,
    question = false,
    plan = false,
    settings = false,
    locale = "en",
  } = {},
) {
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  t.after(() => browser.close());
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    locale: "en-US",
  });
  page.setDefaultTimeout(10000);
  await encryptedFixture(page, { paired: true });
  const errors = [],
    posts = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const state = {
    queue:
      question || plan || settings
        ? []
        : [
            {
              id: "queued-one",
              text: "First native message",
              status: "waiting",
              native: true,
            },
            {
              id: "queued-two",
              text: "Second native message",
              status: "waiting",
              native: true,
            },
          ],
    revision: 1,
  };
  const pending = {
    id: "native-plan:hash",
    text: "1. Inspect files.\n2. Verify changes.",
    turn_id: "original-turn",
    request_id: "plan-request",
  };
  state.live = {
    status: settings ? "idle" : "inProgress",
    turn_id: "original-turn",
    items: [],
    requests: question
      ? [
          {
            id: "native-question",
            kind: "question",
            method: "item/tool/requestUserInput",
            params: {
              questions: [
                {
                  id: "0",
                  question: "Select targets",
                  multiSelect: true,
                  options: [{ label: "One" }, { label: "Two" }],
                },
              ],
            },
          },
        ]
      : [],
    owner: settings
      ? {
          ...owner(),
          capabilities: {
            ...owner().capabilities,
            configure: true,
            send: true,
          },
        }
      : owner(),
    options,
    queue: state.queue,
    queue_revision: 1,
    queue_known: true,
    queue_paused: false,
    pending_plan: plan ? pending : null,
    pending_plan_approval: plan,
  };
  await page.route("**/*", async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    if (u.pathname.startsWith("/api/")) {
      const data = req.postData() ? req.postDataJSON() : {};
      if (req.method() !== "GET")
        posts.push({ path: u.pathname, data, headers: req.headers() });
      if (u.pathname === "/api/device")
        return route.fulfill({
          json: { id: "fixture-device", name: "Test computer", online: true },
        });
      if (u.pathname === "/api/agents")
        return route.fulfill({
          json: {
            agents: [{ id: "claude-desktop", name: "Claude Desktop" }],
            default_agent: "claude-desktop",
          },
        });
      if (u.pathname === "/api/options")
        return route.fulfill({
          json: {
            agent: { id: "claude-desktop", name: "Claude Desktop" },
            models: [
              {
                id: "native-model",
                name: "Native model",
                is_default: true,
                reasoning_efforts: ["low", "medium", "high"].map(
                  (reasoningEffort) => ({ reasoningEffort }),
                ),
                default_effort: "high",
              },
            ],
            defaults: options,
            modes: [
              { name: "Default", mode: "default" },
              { name: "Plan", mode: "plan" },
            ],
            permissions: [
              { id: "default", name: "Ask for approval", available: true },
            ],
            skills: [],
            tools: [],
            capabilities: {
              background_creation: true,
              creation_request_id: true,
              creation_default_permissions_only: true,
              queue: false,
              queue_read: true,
              queue_add: true,
              queue_cancel: true,
              queue_reorder: true,
              queue_edit: false,
              queue_resume: false,
              plan: true,
              pending_plan_approval: true,
              attachments: true,
            },
          },
        });
      if (u.pathname === "/api/sessions")
        return route.fulfill({
          json: { sessions: [session], projects: [project], has_more: false },
        });
      if (u.pathname === "/api/sessions/" + session.id)
        return route.fulfill({
          json: {
            session,
            history_items: [],
            history_has_more: false,
            live: {
              ...state.live,
              queue: state.queue,
              queue_revision: state.revision,
            },
          },
        });
      if (u.pathname.endsWith("/changes"))
        return route.fulfill({ json: { changes: [], pending: false } });
      if (u.pathname.endsWith("/plan"))
        return route.fulfill({
          json: { pending_plan: state.live.pending_plan },
        });
      if (u.pathname.endsWith("/agents"))
        return route.fulfill({ json: { agents: [] } });
      if (u.pathname.endsWith("/settings")) {
        state.live = {
          ...state.live,
          options: { ...state.live.options, ...data },
        };
        return route.fulfill({ json: { options: state.live.options } });
      }
      if (u.pathname.endsWith("/events"))
        return route.fulfill({
          contentType: "text/event-stream",
          body: ": fixture\n\n",
        });
      if (u.pathname.endsWith("/queue") && req.method() === "GET")
        return route.fulfill({
          json: {
            queue: state.queue,
            known: true,
            revision: state.revision,
            paused: false,
          },
        });
      if (u.pathname.endsWith("/reorder")) {
        const id = u.pathname.split("/").at(-2);
        assert.equal(id, "queued-two");
        assert.equal(data.over, "queued-one");
        state.queue.reverse();
        state.revision++;
        return route.fulfill({
          json: {
            queue: state.queue,
            revision: state.revision,
            known: true,
            paused: false,
          },
        });
      }
      if (u.pathname.includes("/queue/") && req.method() === "DELETE") {
        state.queue = state.queue.filter(
          (q) => q.id !== u.pathname.split("/").at(-1),
        );
        state.revision++;
        return route.fulfill({
          json: {
            queue: state.queue,
            revision: state.revision,
            known: true,
            paused: false,
          },
        });
      }
      if (u.pathname.endsWith("/queue") && req.method() === "POST") {
        assert.match(data.request_id, /^[a-f0-9-]{36}$/);
        for (const key of ["model", "effort", "mode", "permission"])
          assert.equal(Object.hasOwn(data, key), false);
        state.queue.push({
          id: data.request_id,
          text: data.text,
          status: "waiting",
          native: true,
        });
        state.revision++;
        return route.fulfill({
          json: {
            queue: state.queue,
            revision: state.revision,
            known: true,
            paused: false,
            message_id: data.request_id,
          },
        });
      }
      if (u.pathname.endsWith("/answer")) {
        state.live = { ...state.live, requests: [] };
        return route.fulfill({ json: { answered: true } });
      }
      if (
        u.pathname.endsWith("/revise-plan") ||
        u.pathname.endsWith("/execute-plan")
      ) {
        assert.equal(data.plan_id, pending.id);
        state.live = {
          ...state.live,
          pending_plan: null,
          pending_plan_approval: false,
          owner: {
            ...owner(),
            capabilities: { ...owner().capabilities, plan: false },
          },
        };
        return route.fulfill({ json: { accepted: true, pending_plan: null } });
      }
      return route.fulfill({
        status: 404,
        json: { error: "Unknown fixture API: " + u.pathname },
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
          ".svg": "image/svg+xml",
        }[path.extname(name)],
      });
    } catch {
      return route.fulfill({ status: 404 });
    }
  });
  await page.goto("https://remote.test/?locale=" + locale);
  await page.locator("#workspace:visible").waitFor();
  if (width < 760) await page.locator("#sidebarToggle").click();
  await page.locator('#sessions button[data-id="' + session.id + '"]').click();
  await page.waitForFunction(() =>
    document.querySelector("#title").textContent.includes("Desktop original"),
  );
  return { page, state, posts, errors };
}
for (const engine of engines) {
  for (const locale of ["en", "zh", "zh-TW", "ja", "de"])
    test(
      engine +
        ": Desktop native effort choices save through the original owner (" +
        locale +
        ")",
      async (t) => {
        const { page, posts, errors } = await fixture(t, engine, {
          settings: true,
          locale,
        });
        await page.waitForFunction(
          () => !document.querySelector("#effort").disabled,
        );
        await page.locator("#message").fill("Preserve this native draft");
        await page.locator("#effort").click();
        const range = page.locator("#reasoningRange");
        assert(await range.isEnabled());
        assert.equal(await range.getAttribute("max"), "2");
        assert.equal(await range.inputValue(), "2");
        await range.press("ArrowLeft");
        await page.waitForFunction(
          () => !document.querySelector("#effort").disabled,
        );
        assert.equal(await range.inputValue(), "1");
        const saved = posts.filter((post) => post.path.endsWith("/settings"));
        assert.equal(saved.length, 1);
        assert.deepEqual(saved[0].data, { effort: "medium" });
        assert.equal(
          saved[0].headers["x-remote-owner-epoch"],
          "native-owner-epoch",
        );
        assert.equal(
          await page.locator("#message").inputValue(),
          "Preserve this native draft",
        );
        assert.deepEqual(errors, []);
      },
    );
  test(
    engine + ": Desktop native queue granular permissions work in browser",
    async (t) => {
      const { page, posts, errors } = await fixture(t, engine);
      await page.locator('[data-queue-id="queued-one"]').waitFor();
      assert(await page.locator(".queue-edit").first().isDisabled());
      assert(await page.locator(".queue-steer").first().isDisabled());
      assert(await page.locator("#stop").isDisabled());
      await page
        .locator('[data-queue-id="queued-two"] .queue-reorder')
        .first()
        .click();
      await page.waitForFunction(
        () =>
          document.querySelector(".queue-row").dataset.queueId === "queued-two",
      );
      await page.locator('[data-queue-id="queued-one"] .queue-remove').click();
      await page
        .locator('[data-queue-id="queued-one"]')
        .waitFor({ state: "hidden" });
      const picker = page.waitForEvent("filechooser");
      await page.locator("#attach").click();
      await (await picker).setFiles([]);
      await page.locator("#message").fill("Native queued prompt");
      await page.locator("#send").click();
      await page.waitForFunction(
        () => document.querySelector("#message").value === "",
      );
      const queued = posts.find(
        (p) =>
          p.path.endsWith("/queue") && p.data.text === "Native queued prompt",
      );
      assert(queued);
      assert.equal(
        queued.headers["x-remote-owner-epoch"],
        "native-owner-epoch",
      );
      assert.equal(
        posts.filter(
          (p) =>
            p.path.endsWith("/steer") ||
            p.path.endsWith("/interrupt") ||
            p.path.endsWith("/turn"),
        ).length,
        0,
      );
      assert.deepEqual(errors, []);
    },
  );
  test(
    engine + ": Desktop multi-select question submits all selected labels",
    async (t) => {
      const { page, posts, errors } = await fixture(t, engine, {
        question: true,
        width: 390,
      });
      await page.locator("#requestDialog[open]").waitFor();
      await page.locator("#requests input[type=checkbox][value=One]").check();
      await page.locator("#requests input[type=checkbox][value=Two]").check();
      await page
        .getByRole("button", { name: "Submit answer", exact: true })
        .click();
      await page.locator("#requestDialog").waitFor({ state: "hidden" });
      assert.deepEqual(posts.find((p) => p.path.endsWith("/answer")).data, {
        id: "native-question",
        answers: { 0: ["One", "Two"] },
      });
      assert.deepEqual(errors, []);
    },
  );
  for (const action of ["revise-plan", "execute-plan"])
    test(
      engine +
        ": Desktop pending plan " +
        action +
        " while original turn is running",
      async (t) => {
        const { page, posts, errors } = await fixture(t, engine, {
          plan: true,
        });
        await page.locator("#planAction:visible").waitFor();
        if (action === "revise-plan") {
          await page.locator("#continuePlanning").click();
          await page
            .locator("#planFeedback")
            .fill("Preserve API compatibility.");
          await page.locator("#confirmRevisePlan").click();
        } else {
          await page.locator("#executePlan").click();
          await page.locator("#confirmExecutePlan").click();
        }
        await page.waitForFunction(
          () => document.querySelector("#planAction").hidden,
        );
        const submitted = posts.find((p) => p.path.endsWith("/" + action));
        assert(submitted);
        assert.equal(submitted.data.plan_id, "native-plan:hash");
        if (action === "revise-plan")
          assert.equal(submitted.data.feedback, "Preserve API compatibility.");
        assert.equal(
          posts.filter(
            (p) => p.path.endsWith("/turn") || p.path.endsWith("/steer"),
          ).length,
          0,
        );
        assert.deepEqual(errors, []);
      },
    );
}
