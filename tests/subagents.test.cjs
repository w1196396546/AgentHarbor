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

async function fixture(t, engine, lang, width = 1280, options = {}) {
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  t.after(() => browser.close());
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    locale: lang,
  });
  await encryptedFixture(page);
  page.setDefaultTimeout(10000);
  const errors = [],
    requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const project = "/work/project",
    parent = { id: "parent", title: "Parent task", cwd: project },
    other = { id: "other", title: "Another task", cwd: project },
    child = {
      id: "child-one",
      name: "File reviewer",
      role: "explorer",
      status: "inProgress",
    },
    malicious = {
      id: "child-two",
      name: '<img src=x onerror="window.unsafe=true">',
      status: "completed",
    };
  let agents = options.agents || [child, malicious],
    detail = null,
    failure = null,
    release = null,
    delayedReady;
  const delayed = new Promise((resolve) => {
    delayedReady = resolve;
  });
  await page.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      p = url.pathname;
    if (p.startsWith("/api/")) {
      requests.push({ path: p, method: req.method(), search: url.search });
      if (p === "/api/pair") return route.fulfill({ json: { paired: true } });
      if (p === "/api/device")
        return route.fulfill({
          json: { id: "fixture", name: "My computer", online: true },
        });
      if (p === "/api/agents")
        return route.fulfill({
          json: {
            agents: [{ id: "codex", name: "Codex" }],
            default_agent: "codex",
          },
        });
      if (p === "/api/options")
        return route.fulfill({
          json: {
            models: [],
            modes: [],
            tools: [],
            skills: [],
            permissions: [],
            defaults: {},
            capabilities: { subagents: true },
          },
        });
      if (p === "/api/sessions")
        return route.fulfill({
          json: {
            sessions: [parent, other],
            projects: [project],
            total: 2,
            next: 2,
            has_more: false,
          },
        });
      if (p.endsWith("/changes"))
        return route.fulfill({
          json: { changes: [], warning: "", pending: false },
        });
      if (p.endsWith("/plan"))
        return route.fulfill({ json: { pending_plan: null } });
      if (p === "/api/sessions/parent" || p === "/api/sessions/other") {
        const session = p.endsWith("/parent") ? parent : other;
        return route.fulfill({
          json: {
            session,
            history_items: [
              {
                id: session.id + "-message",
                type: "agentMessage",
                text: session.title + " response",
              },
            ],
            live: {
              status: options.running ? "inProgress" : "completed",
              items: [],
              owner: {
                kind: "native",
                state: "connected",
                epoch: "owner-1",
                capabilities: { send: true, configure: true },
              },
            },
          },
        });
      }
      if (
        p === "/api/threads/parent/agents" ||
        p === "/api/threads/other/agents"
      )
        return route.fulfill({
          json: { agents: p.includes("/parent/") ? agents : [] },
        });
      if (p === "/api/threads/parent/agents/child-one") {
        if (failure) return route.fulfill(failure);
        if (detail)
          return route.fulfill({
            json: detail(url.searchParams.get("cursor")),
          });
        const older = url.searchParams.has("cursor");
        if (older) assert.equal(url.searchParams.get("cursor"), "older-page");
        return route.fulfill({
          json: {
            read_only: true,
            session: child,
            history_items: older
              ? [
                  {
                    id: "child-old",
                    turn_id: options.turns ? "child-turn" : undefined,
                    type: "userMessage",
                    text: "Review these files",
                  },
                ]
              : [
                  {
                    id: "child-answer",
                    turn_id: options.turns ? "child-turn" : undefined,
                    type: "agentMessage",
                    text: "Reviewing the source now\n\n[review.txt](review.txt)",
                  },
                  {
                    id: "child-diff",
                    turn_id: options.turns ? "child-turn" : undefined,
                    type: "fileChange",
                    data: {
                      changes: [{ path: "review.txt", diff: "+review result" }],
                    },
                  },
                ],
            history_next_cursor: older ? "" : "older-page",
            history_has_more: !older,
          },
        });
      }
      if (p === "/api/threads/parent/agents/child-two") {
        delayedReady();
        await new Promise((resolve) => {
          release = resolve;
        });
        return route
          .fulfill({
            json: {
              read_only: true,
              session: malicious,
              history_items: [
                {
                  id: "late-child",
                  type: "agentMessage",
                  text: "Late child response",
                },
              ],
              history_next_cursor: "",
            },
          })
          .catch(() => {});
      }
      return route.fulfill({ status: 404, json: { error: "Unknown API" } });
    }
    const name = p === "/" ? "index.html" : p.slice(1);
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
  await page.goto("https://remote.test/#key=" + pairCode);
  await page.locator('#sessions [data-id="parent"]').waitFor();
  async function select(id) {
    if (width <= 760 && !(await page.locator("#navBackdrop").isVisible()))
      await page.locator("#sidebarToggle").click();
    await page.locator('#sessions [data-id="' + id + '"]').click();
    await page
      .locator("#title")
      .filter({ hasText: id === "parent" ? "Parent task" : "Another task" })
      .waitFor();
  }
  await select("parent");
  if (agents.length) await page.locator("#subagentsBar:visible").waitFor();
  return {
    page,
    requests,
    errors,
    select,
    setAgents: (value) => {
      agents = value;
    },
    setFailure: (value) => {
      failure = value;
    },
    setDetail: (value) => {
      detail = value;
    },
    release: () => release?.(),
    waitForDelayed: () => delayed,
  };
}

for (const engine of engines) {
  test(`${engine}: child conversation details render beside the overview and preserve pagination`, async (t) => {
    const { page, requests, errors } = await fixture(t, engine, "zh-CN", 390, {
      turns: true,
    });
    await page.locator("#message").fill("Keep my draft");
    await page.locator("#subagentsToggle").click();
    await page.locator('#subagentsList [data-agent-id="child-one"]').click();
    await page
      .locator("#subagentsList .subagent-overview")
      .filter({ hasText: "Reviewing the source now" })
      .waitFor();
    assert.deepEqual(
      errors,
      [],
      "rendering the detailed history must not throw while its overview still renders",
    );
    const reply = page.locator("#subagentMessages [data-id=child-answer]");
    await reply.waitFor();
    assert.equal(await reply.isVisible(), true);
    assert.equal(
      await reply.getByRole("button").count(),
      1,
      "the detailed reply keeps its copy action",
    );
    assert.equal(
      await page
        .locator(
          '#subagentMessages .turn-summary[data-turn="child-turn"] button:not(:disabled)',
        )
        .count(),
      1,
      "the turn summary keeps its copy action",
    );
    assert.equal(
      await page.locator("#subagentMessages [data-id=child-diff]").isVisible(),
      true,
    );
    await page.locator("#subagentOlder").click();
    await page.locator("#subagentMessages [data-id=child-old]").waitFor();
    assert.equal(await page.locator("#subagentOlder").isVisible(), false);
    assert.equal(
      await reply.count(),
      1,
      "loading earlier history retains the detailed reply",
    );
    assert.equal(await page.locator("#message").inputValue(), "Keep my draft");
    assert.equal(await page.locator("#title").textContent(), "Parent task");
    assert.equal(
      requests.filter(
        (request) => request.method !== "GET" && request.path !== "/api/pair",
      ).length,
      0,
    );
    assert.deepEqual(errors, []);
  });
  for (const width of [320, 390])
    test(`${engine} ${width}px: long agent names keep status and chevron inside the dialog`, async (t) => {
      const { page, errors, setAgents } = await fixture(
        t,
        engine,
        "zh-CN",
        width,
      );
      setAgents([
        {
          id: "long-name",
          name: "LongUnbrokenAgentName".repeat(12),
          status: "running",
        },
      ]);
      await page.locator("#subagentsToggle").click();
      await page
        .locator('#subagentsList [data-agent-id="long-name"]')
        .waitFor();
      const fits = await page
        .locator('#subagentsList [data-agent-id="long-name"]')
        .evaluate((row) => {
          const dialog = row.closest("dialog").getBoundingClientRect(),
            bounds = row.getBoundingClientRect();
          return (
            [
              row.querySelector(".subagent-name"),
              row.querySelector(".subagent-status"),
              row.lastElementChild,
            ].every((node) => {
              const box = node.getBoundingClientRect();
              return (
                box.left >= bounds.left &&
                box.right <= bounds.right &&
                box.top >= bounds.top &&
                box.bottom <= bounds.bottom &&
                box.right <= dialog.right
              );
            }) && row.scrollWidth <= row.clientWidth + 1
          );
        });
      assert(
        fits,
        "long name, status and trailing icon stay within their row and dialog",
      );
      if (engine === "chromium")
        await page.screenshot({
          path: `/tmp/fullcup-subagents-long-${width}.png`,
        });
      assert.deepEqual(errors, []);
    });
  test(`${engine}: live history restores pagination after an exhausted nonoverlapping page`, async (t) => {
    const { page, errors, setDetail } = await fixture(t, engine, "en-US");
    await page.locator("#subagentsToggle").click();
    await page.locator('#subagentsList [data-agent-id="child-one"]').click();
    await page.getByText("Reviewing the source now", { exact: true }).waitFor();
    await page.locator("#subagentOlder").click();
    await page.getByText("Review these files", { exact: true }).waitFor();
    assert.equal(await page.locator("#subagentOlder").isVisible(), false);
    setDetail((cursor) => ({
      read_only: true,
      session: { id: "child-one" },
      history_items: cursor
        ? [
            {
              id: "child-answer",
              type: "agentMessage",
              text: "Reviewing the source now",
            },
            { id: "child-diff", type: "fileChange", data: { changes: [] } },
            {
              id: "child-gap",
              type: "agentMessage",
              text: "Messages between history pages",
            },
          ]
        : [
            {
              id: "child-new",
              type: "agentMessage",
              text: "A later page arrived",
            },
          ],
      history_next_cursor: cursor ? "" : "gap-page",
    }));
    await page.getByText("A later page arrived", { exact: true }).waitFor();
    await page.locator("#subagentOlder:visible").waitFor();
    await page.locator("#subagentOlder").click();
    await page
      .getByText("Messages between history pages", { exact: true })
      .waitFor();
    assert.deepEqual(
      await page
        .locator("#subagentMessages [data-id]")
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.id)),
      ["child-old", "child-answer", "child-diff", "child-gap", "child-new"],
    );
    assert.equal(await page.locator("#subagentOlder").isVisible(), false);
    assert.deepEqual(errors, []);
  });
  test(`${engine}: agents spawned during a running turn appear and refresh without navigation`, async (t) => {
    const { page, requests, errors, setAgents } = await fixture(
      t,
      engine,
      "en-US",
      1280,
      { agents: [], running: true },
    );
    assert.equal(await page.locator("#subagentsBar").isVisible(), false);
    setAgents([
      { id: "child-one", name: "File reviewer", status: "inProgress" },
    ]);
    await page.locator("#subagentsBar:visible").waitFor();
    await page.locator("#subagentsToggle").click();
    await page
      .locator('#subagentsList [data-agent-id="child-one"]')
      .filter({ hasText: "Running" })
      .waitFor();
    await page.locator('#subagentsList [data-agent-id="child-one"]').click();
    await page.getByText("Reviewing the source now", { exact: true }).waitFor();
    const prior = requests.filter((request) =>
      request.path.endsWith("/agents/child-one"),
    ).length;
    await page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/agents/child-one"),
    );
    assert(
      requests.filter((request) => request.path.endsWith("/agents/child-one"))
        .length > prior,
    );
    assert.equal(
      await page.locator("#subagentMessages [data-id=child-answer]").count(),
      1,
    );
    setAgents([
      { id: "child-one", name: "File reviewer", status: "completed" },
    ]);
    await page.locator("#subagentsBack").click();
    await page
      .locator('#subagentsList [data-agent-id="child-one"]')
      .filter({ hasText: "Completed" })
      .waitFor();
    assert.equal(await page.locator("#title").textContent(), "Parent task");
    assert.deepEqual(errors, []);
  });
  for (const [lang, label, width] of [
    ["en-US", "Agents", 1280],
    ["zh-CN", "智能体", 390],
    ["zh-TW", "智慧代理", 390],
    ["ja-JP", "エージェント", 390],
    ["de-DE", "Agenten", 1280],
  ]) {
    test(`${engine} ${lang}: agents above composer show read-only history and pagination`, async (t) => {
      const { page, requests, errors } = await fixture(t, engine, lang, width);
      assert.match(
        await page.locator("#subagentsToggle").innerText(),
        new RegExp(label),
      );
      assert.equal(await page.locator("#subagentsCount").textContent(), "2");
      const bubble = await page.locator("#subagentsToggle").boundingBox(),
        composer = await page.locator("#composer").boundingBox();
      assert(
        bubble.y + bubble.height <= composer.y,
        "agents bubble is above composer",
      );
      if (width <= 760) {
        const permission = await page.locator("#permission").boundingBox();
        const toolbar = await page.locator(".composer-toolbar").boundingBox();
        const scroll = await page.locator("#conversationScroll").boundingBox();
        assert(
          permission.x >= toolbar.x &&
            permission.y >= toolbar.y &&
            permission.x + permission.width <= toolbar.x + toolbar.width + 1 &&
            permission.y + permission.height <= toolbar.y + toolbar.height + 1,
          "permission stays inside the composer toolbar",
        );
        assert(
          permission.x >= composer.x &&
            permission.y >= composer.y &&
            permission.x + permission.width <= composer.x + composer.width &&
            permission.y + permission.height <= composer.y + composer.height,
          "permission stays inside the composer",
        );
        assert(permission.width > 0 && permission.height >= 30, "permission remains a visible control");
        assert(bubble.y + bubble.height <= permission.y, "agents do not overlap composer controls");
        assert(
          bubble.y >= scroll.y && bubble.x >= 0 && bubble.x + bubble.width <= width,
          "agents stay visible below the conversation header",
        );
        await page.locator("#latest").evaluate((node) => { node.hidden = false; });
        const latest = await page.locator("#latest").boundingBox();
        assert(bubble.x + bubble.width <= latest.x, "latest output does not overlap agents");
        assert(latest.y + latest.height <= permission.y, "latest output does not overlap composer controls");
      }
      assert.equal(await page.locator("#sessions [data-id]").count(), 2);
      await page.locator("#message").fill("Keep my draft");
      await page.locator("#subagentsToggle").click();
      await page
        .locator('#subagentsList [data-agent-id="child-one"]')
        .waitFor();
      if (engine === "chromium" && lang === "zh-CN")
        await page.screenshot({ path: "/tmp/fullcup-subagents-list.png" });
      assert.equal(await page.locator("#subagentsList img").count(), 0);
      assert(
        await page
          .locator("#subagentsList")
          .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
        "agent names and statuses fit the list",
      );
      assert.equal(await page.evaluate(() => window.unsafe), undefined);
      await page.locator('#subagentsList [data-agent-id="child-one"]').click();
      await page
        .getByText("Reviewing the source now", { exact: true })
        .waitFor();
      if (engine === "chromium" && lang === "zh-CN")
        await page.screenshot({ path: "/tmp/fullcup-subagents-detail.png" });
      assert.equal(
        await page.locator("#subagentMessages .changed-file-button").count(),
        0,
      );
      assert.equal(
        await page.locator("#subagentMessages [data-file-path]").count(),
        0,
      );
      assert.match(
        await page.locator("#subagentMessages").innerText(),
        /review result/,
      );
      await page.locator("#subagentOlder").click();
      await page.getByText("Review these files", { exact: true }).waitFor();
      assert.equal(await page.locator("#subagentOlder").isVisible(), false);
      assert.equal(
        await page.locator("#subagentMessages [data-id=child-answer]").count(),
        1,
      );
      await page.locator("#subagentsBack").click();
      await page
        .locator('#subagentsList [data-agent-id="child-one"]')
        .waitFor();
      await page.locator("#closeSubagents").click();
      assert.equal(
        await page.locator("#message").inputValue(),
        "Keep my draft",
      );
      assert.equal(await page.locator("#title").textContent(), "Parent task");
      assert.equal(
        requests.filter(
          (request) => request.method !== "GET" && request.path !== "/api/pair",
        ).length,
        0,
        "observing children never connects or sends",
      );
      assert.deepEqual(errors, []);
    });
  }
  test(`${engine}: failed child reads preserve the parent and late replies stay in their scope`, async (t) => {
    const {
      page,
      requests,
      errors,
      select,
      setFailure,
      release,
      waitForDelayed,
    } = await fixture(t, engine, "en-US");
    await page.locator("#subagentsToggle").click();
    await page.locator('#subagentsList [data-agent-id="child-one"]').click();
    await page.getByText("Reviewing the source now", { exact: true }).waitFor();
    setFailure({
      status: 410,
      json: {
        error: "Child unavailable",
        archived: true,
        history_unavailable: true,
      },
    });
    await page.locator("#subagentOlder").click();
    await page
      .locator("#subagentsStatus")
      .filter({ hasText: "Child unavailable" })
      .waitFor();
    assert.match(
      await page.locator("#subagentMessages").innerText(),
      /Reviewing the source now/,
    );
    assert.equal(await page.locator("#title").textContent(), "Parent task");
    assert.equal(await page.locator('#sessions [data-id="parent"]').count(), 1);
    await page.locator("#subagentsBack").click();
    await page.locator('#subagentsList [data-agent-id="child-two"]').click();
    await waitForDelayed();
    await page.locator("#closeSubagents").click();
    await select("other");
    release();
    await page
      .locator("#history")
      .filter({ hasText: "Another task response" })
      .waitFor();
    assert.equal(await page.locator("#subagentsBar").isVisible(), false);
    assert.equal(
      await page.locator("#subagentsDialog").evaluate((node) => node.open),
      false,
    );
    assert.equal(
      await page.getByText("Late child response", { exact: true }).count(),
      0,
    );
    assert.equal(
      requests.filter((request) => /connect|turn|interrupt/.test(request.path))
        .length,
      0,
    );
    assert.deepEqual(errors, []);
  });
}
