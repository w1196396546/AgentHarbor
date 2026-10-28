const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
const modulePromise = fs.readFile(path.join(__dirname, "../web/src/features/workspace-context.js"), "utf8")
  .then(source => import("data:text/javascript;base64," + Buffer.from(source).toString("base64")));

async function fixture() {
  const { createWorkspaceContext } = await modulePromise;
  const nodes = new Map(), calls = [], menus = [];
  const state = { generation: 1, project: "/projects/one", selected: "", optionsLoaded: true, device: { id: "device", online: true }, catalog: { capabilities: { workspace_git: true } } };
  let response = async () => ({ cwd: state.selected ? state.session.cwd : state.project, repository: true, branch: "main", head: "", branches: ["main", "feature"] });
  const $ = id => {
    if (!nodes.has(id)) nodes.set(id, { setAttribute(key, value) { this[key] = value; } });
    return nodes.get(id);
  };
  const workspace = createWorkspaceContext({ $, state, t: x => x, getAgent: () => ({ id: "codex" }),
    api: async url => { calls.push(url); return response(url); },
    showMenu: (_, entries) => menus.push(entries), chooseComposeProject: () => calls.push("chooseProject"),
    projectName: path => path.split("/").at(-1) });
  return { ...workspace, $, state, calls, menus, respond: fn => response = fn };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test("project and branch are immutable for existing conversations, including stale menu actions", async () => {
  const f = await fixture();
  f.renderWorkspace(); await tick();
  await f.$("workspaceBranch").onclick();
  const choose = f.menus[0].find(entry => entry.label === "feature").action;
  choose();
  assert.equal(f.state.creationBranch, "feature");
  f.state.selected = "existing"; f.state.session = { cwd: "/other/worktree" }; f.state.generation++;
  f.renderWorkspace(); await tick();
  choose(); f.$("workspaceProject").onclick(); await f.$("workspaceBranch").onclick();
  assert.equal(f.$("workspaceProject").disabled, true);
  assert.equal(f.$("workspaceProject").textContent, "one");
  assert.equal(f.$("workspaceProject").title, "/other/worktree");
  assert.equal(f.$("workspaceProject")["aria-label"], "Project folder: one");
  assert.equal(f.$("workspaceBranch").disabled, true);
  assert.equal(f.state.creationBranch, "");
  assert.equal(f.$("workspaceBranch").textContent, "main");
  assert(!f.calls.includes("chooseProject"));
  assert.equal(f.menus.length, 1);
});

test("late Git reads cannot replace another project; failures stay unknown and older clients do not request new APIs", async () => {
  const f = await fixture();
  let release;
  f.respond(() => new Promise(resolve => release = resolve));
  f.renderWorkspace();
  f.state.project = "/projects/two"; f.state.generation++;
  f.respond(async () => { throw Error("unreadable"); });
  f.renderWorkspace(); await tick();
  release({ cwd: "/projects/one", repository: true, branch: "wrong", branches: [] }); await tick();
  assert.equal(f.$("workspaceProject").textContent, "two");
  assert.equal(f.$("workspaceProject").title, "/projects/two");
  assert.equal(f.$("workspaceBranch").textContent, "Branch unknown");
  assert.equal(f.$("workspaceBranch").title, "unreadable");
  f.state.generation++; f.state.catalog.capabilities = {};
  const count = f.calls.length;
  f.renderWorkspace(); await tick();
  assert.equal(f.calls.length, count);
});

test("projectless drafts retain the project picker without requesting or exposing a branch", async () => {
  const f = await fixture();
  let release;
  f.respond(() => new Promise(resolve => release = resolve));
  f.renderWorkspace();
  f.state.project = ""; f.state.projectless = true; f.state.generation++;
  f.renderWorkspace();
  release({ cwd: "/projects/one", repository: true, branch: "main", branches: ["main"] });
  await tick();
  assert.equal(f.$("workspaceContext").hidden, false);
  assert.equal(f.$("workspaceProject").textContent, "Work outside a project");
  assert(!f.$("workspaceProject").disabled);
  assert.equal(f.$("workspaceProject").title, "");
  assert.equal(f.$("workspaceBranchControl").hidden, true);
  await f.$("workspaceBranch").onclick();
  assert.deepEqual(f.calls, ["workspace?project=%2Fprojects%2Fone"]);
  f.$("workspaceProject").onclick();
  assert.equal(f.calls.at(-1), "chooseProject");
});
