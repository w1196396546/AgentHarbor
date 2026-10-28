const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
const { chromium, webkit } = require("playwright");
const { encryptedFixture } = require("./e2ee-fixture.cjs");
const assets = path.resolve(__dirname, "../internal/relay/assets");

async function fixture(t, { agent = "codex", windows = false, legacy = false } = {}) {
  const engine = process.env.BROWSER || (windows ? "webkit" : "chromium");
  const browser = await ({ chromium, webkit }[engine]).launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: windows ? 390 : 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  await encryptedFixture(page, { paired: true });
  await page.addInitScript(theme => {
    localStorage.setItem("codex.remote.language", "en");
    localStorage.setItem("codex.remote.theme", theme);
  }, windows ? "light" : "dark");
  const project = windows ? "C:\\work\\shop" : "/projects/shop";
  const projectName = "A shared project with a deliberately long name that must not stretch the composer controls";
  const directoryID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const cwd = windows ? "C:\\managed\\projectless\\" + directoryID : "/managed/projectless/" + directoryID;
  const prefs = { model: "fixture-model", mode: "default", permission: "default" };
  const capabilities = { background_creation: true, workspace_git: true, ...(!legacy && { projectless_creation: true, creation_request_id: true }) };
  const live = { status: "idle", items: [], requests: [], queue: [], options: prefs,
    owner: { kind: agent === "codex" ? "background" : "native", state: "connected", epoch: "fixture-owner", capabilities: { send: true, configure: true } } };
  const session = { id: "created", title: "Projectless conversation", projectless: true, cwd, source: agent === "codex" ? "remote" : agent };
  const requests = [], errors = [], unknown = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), name = url.pathname;
    if (name.startsWith("/api/")) requests.push({ path: name, query: url.searchParams, method: request.method(), body: request.postData() ? request.postDataJSON() : undefined });
    if (name === "/api/device") return route.fulfill({ json: { id: "fixture", name: "Local", online: true } });
    if (name === "/api/agents") return route.fulfill({ json: { agents: [{ id: agent, name: agent, state: "connected" }], default_agent: agent } });
    if (name === "/api/sessions") return route.fulfill({ json: {
      capabilities, projects: [project], sidebar_projects: [{ id: "shop", name: projectName, root_paths: [project] }],
      sessions: requests.some(entry => entry.path === "/api/threads") ? [session] : [],
    } });
    if (name === "/api/options") return route.fulfill({ json: {
      agent: { id: agent }, models: [{ id: "fixture-model", model: "fixture-model", displayName: "Fixture", supportedReasoningEfforts: [] }],
      modes: [], permissions: [], skills: [], tools: [], defaults: prefs, capabilities,
    } });
    if (name === "/api/workspace") return route.fulfill({ json: { cwd: project, repository: true, branch: "main", head: "", branches: ["main"] } });
    if (name === "/api/threads") return route.fulfill({ json: { ...session, live } });
    if (name === "/api/threads/created/turn") return route.fulfill({ json: { turn_id: "first-turn" } });
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
  await page.goto("https://projectless.test/");
  await page.waitForFunction(() => document.getElementById("workspaceBranch").textContent === "main");
  return { page, project, projectName, cwd, directoryID, requests, clean() { assert.deepEqual(errors, []); assert.deepEqual(unknown, []); } };
}

for (const options of [{ agent: "codex" }, { agent: "claude-desktop", windows: true }]) {
  test(`${options.agent}: projectless first send keeps its workspace after refresh`, async t => {
    const { page, projectName, cwd, directoryID, requests, clean } = await fixture(t, options);
    assert.equal(await page.locator("#workspaceProject").textContent(), projectName);
    const layout = await page.locator("#workspaceContext").evaluate(node => {
      const box = node.getBoundingClientRect(), composer = document.getElementById("composer").getBoundingClientRect();
      return { insideForm: !!node.closest("#composer"), bottom: box.bottom, composerTop: composer.top, projectWidth: document.getElementById("workspaceProject").getBoundingClientRect().width };
    });
    assert.equal(layout.insideForm, false);
    assert(layout.bottom <= layout.composerTop, "workspace sits above the input surface");
    assert(layout.projectWidth <= 240, "long project name stays compact");
    if (process.env.ARTIFACT_DIR) {
      await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.ARTIFACT_DIR, `${options.agent}-workspace-project.png`), fullPage: true, animations: "disabled" });
    }
    const gitReads = requests.filter(entry => entry.path === "/api/workspace").length;
    await page.locator("#workspaceProject").click();
    await page.locator("#menu button").filter({ hasText: "Work outside a project" }).click();
    await page.waitForFunction(() => document.getElementById("workspaceProject").textContent === "Work outside a project" && !document.getElementById("message").disabled);
    assert(await page.locator("#workspaceBranchControl").isHidden());
    if (options.windows) await page.locator("#sidebarToggle").click();
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/api/sessions"),
      page.locator("#refresh").click(),
    ]);
    if (options.windows) await page.locator("#navBackdrop").click({ position: { x: 380, y: 40 } });
    assert.equal(await page.locator("#workspaceProject").textContent(), "Work outside a project");
    await page.locator("#message").fill("A fictional first message");
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/api/threads/created/turn"),
      page.locator("#send").click(),
    ]);
    await page.waitForFunction(() => !document.getElementById("message").value);
    await page.locator("#title").filter({ hasText: "Projectless conversation" }).waitFor();
    const creation = requests.filter(entry => entry.path === "/api/threads");
    assert.equal(creation.length, 1);
    assert.equal(creation[0].body.project, "");
    assert.equal(creation[0].body.projectless, true);
    assert.equal(creation[0].body.executor, "background");
    assert.match(creation[0].body.request_id, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
    assert(requests.some(entry => entry.path === "/api/options" && entry.query.get("projectless") === "true"));
    assert.equal(requests.filter(entry => entry.path === "/api/threads/created/turn").length, 1);
    assert.equal(requests.find(entry => entry.path === "/api/threads/created/turn").body.text, "A fictional first message");
    assert.equal(await page.locator("#workspaceProject").textContent(), "Work outside a project");
    assert.equal(await page.locator("#workspaceProject").getAttribute("title"), cwd);
    assert(await page.locator("#workspaceProject").isDisabled());
    assert(await page.locator("#workspaceBranchControl").isHidden());
    assert.equal(requests.filter(entry => entry.path === "/api/workspace").length, gitReads);
    assert(!(await page.locator("#breadcrumbProject").textContent()).includes(directoryID));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.ARTIFACT_DIR)
      await page.screenshot({ path: path.join(process.env.ARTIFACT_DIR, `${options.agent}-workspace-projectless.png`), fullPage: true, animations: "disabled" });
    clean();
  });
}

test("older clients keep projectless creation disabled with an upgrade explanation", async t => {
  const { page, requests, clean } = await fixture(t, { legacy: true });
  await page.locator("#workspaceProject").click();
  const option = page.locator("#menu button").filter({ hasText: "Work outside a project" });
  assert(await option.isDisabled());
  assert.match((await option.textContent()) + " " + (await option.getAttribute("title")), /updat|upgrad/i);
  assert.equal(requests.filter(entry => entry.path === "/api/threads").length, 0);
  clean();
});
