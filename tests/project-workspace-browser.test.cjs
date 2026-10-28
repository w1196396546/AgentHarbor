const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
const { chromium, webkit } = require("playwright");
const { encryptedFixture } = require("./e2ee-fixture.cjs");
const assets = path.resolve(__dirname, "../internal/relay/assets");
const engines = process.env.BROWSER ? [process.env.BROWSER] : ["chromium", "webkit"];

for (const engine of engines) for (const agent of ["codex", "claude-desktop"])
  for (const locale of ["en", "zh", "zh-TW", "ja", "de"]) {
  test(`${engine} ${agent} ${locale}: new branch creation and immutable conversation workspace`, async t => {
    const browser = await ({ chromium, webkit }[engine]).launch();
    t.after(() => browser.close());
    const mobile = locale !== "en";
    const page = await browser.newPage({ viewport: { width: mobile ? 390 : 1280, height: 900 } });
    page.setDefaultTimeout(10000);
    await encryptedFixture(page, { paired: true });
    await page.addInitScript(({ locale }) => {
      localStorage.setItem("codex.remote.language", locale);
      localStorage.setItem("codex.remote.theme", locale === "zh" ? "light" : "dark");
    }, { locale });
    const project = "/projects/shop";
    const prefs = { model: "fixture-model", mode: "default", permission: "default" };
    const live = { status: "idle", items: [], requests: [], queue: [], options: prefs,
      owner: { kind: agent === "codex" ? "background" : "native", state: "connected", epoch: "fixture", capabilities: { send: true, configure: true } } };
    const session = { id: "created", title: "Branch conversation", cwd: project, source: agent === "codex" ? "remote" : agent };
    const posts = [], errors = [], unknown = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url()), name = url.pathname;
      if (request.method() === "POST") posts.push({ path: name, body: request.postDataJSON() });
      if (name === "/api/device") return route.fulfill({ json: { id: "fixture", name: "Local", online: true } });
      if (name === "/api/agents") return route.fulfill({ json: { agents: [{ id: agent, name: agent }], default_agent: agent } });
      if (name === "/api/sessions") return route.fulfill({ json: { projects: [project], sidebar_projects: [{ id: "shop", name: "Shop project", root_paths: [project] }], sessions: posts.some(x => x.path === "/api/threads") ? [session] : [] } });
      if (name === "/api/options") return route.fulfill({ json: { agent: { id: agent }, models: [{ id: "fixture-model", model: "fixture-model", displayName: "Fixture", supportedReasoningEfforts: [] }], modes: [], permissions: [], defaults: prefs, capabilities: { background_creation: true, workspace_git: true } } });
      if (name === "/api/workspace") return route.fulfill({ json: { cwd: project, repository: true, branch: url.searchParams.has("thread") ? "feature/test" : "main", head: "", branches: ["main", "feature/test"] } });
      if (name === "/api/threads") return route.fulfill({ json: { ...session, live } });
      if (name === "/api/sessions/created") return route.fulfill({ json: { session, history_items: [], live } });
      if (name === "/api/sessions/created/events") return route.fulfill({ contentType: "text/event-stream", body: ": fixture\n\n" });
      if (name === "/api/threads/created/changes") return route.fulfill({ json: { changes: [] } });
      if (name === "/api/threads/created/plan") return route.fulfill({ json: { plan: null } });
      if (name === "/api/threads/created/queue") return route.fulfill({ json: { queue: [] } });
      if (name.startsWith("/api/")) { unknown.push(name); return route.fulfill({ status: 404 }); }
      const file = name === "/" ? "index.html" : name.slice(1);
      if (file === "favicon.ico") return route.fulfill({ status: 204 });
      return route.fulfill({ body: await fs.readFile(path.join(assets, file)), contentType: { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" }[path.extname(file)] });
    });
    await page.goto("https://workspace.test/");
    await page.waitForFunction(() => document.getElementById("workspaceBranch").textContent === "main");
    assert.equal(await page.locator("#workspaceProject").textContent(), "Shop project");
    assert.equal(await page.locator("#workspaceProject").getAttribute("title"), project);
    await page.locator("#workspaceBranch").click();
    await page.locator("#menu button").filter({ hasText: "feature/test" }).click();
    assert.equal(await page.locator("#workspaceBranch").textContent(), "feature/test");
    await page.locator("#startChat").click();
    await page.locator("#title").filter({ hasText: "Branch conversation" }).waitFor();
    await page.waitForFunction(() => document.getElementById("workspaceBranch").textContent === "feature/test");
    assert(await page.locator("#workspaceProject").isDisabled());
    assert(await page.locator("#workspaceBranch").isDisabled());
    assert(await page.locator("#breadcrumbProject").isDisabled());
    assert.equal(posts.filter(x => x.path === "/api/threads").length, 1);
    assert.equal(posts.find(x => x.path === "/api/threads").body.branch, "feature/test");
    assert.equal(posts.find(x => x.path === "/api/threads").body.project, project);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (engine === "chromium" && agent === "codex" && ["zh", "en"].includes(locale)) {
      const dir = path.resolve(__dirname, "../output/workspace");
      await fs.mkdir(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, locale + ".png"), fullPage: true });
    }
    assert.deepEqual(errors, []); assert.deepEqual(unknown, []);
  });
}
