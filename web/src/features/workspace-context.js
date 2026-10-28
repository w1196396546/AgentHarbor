export function createWorkspaceContext({ $, t, state, api, getAgent, showMenu, chooseComposeProject, projectName }) {
  let scope = "", value = null, pending = null, error = "", readAt = 0;
  const context = () => JSON.stringify([
    state.device?.id, getAgent().id, state.generation, state.selected,
    state.selected ? state.session?.cwd || state.cwd : state.project,
  ]);
  function renderWorkspace() {
    const next = context();
    if (scope !== next) {
      scope = next;
      value = null;
      pending = null;
      error = "";
      readAt = 0;
      state.creationBranch = "";
    }
    const cwd = value?.cwd || (state.selected ? state.session?.cwd || state.cwd : state.project) || "";
    const available = state.catalog.capabilities?.workspace_git === true;
    $("workspaceContext").hidden = false;
    const projectless = state.projectless || state.session?.projectless === true;
    $("workspaceProject").textContent = projectless ? t("Work outside a project") : cwd ? projectName(state.project || cwd) : t("Choose a project");
    $("workspaceProject").setAttribute("aria-label", t("Project folder") + ": " + $("workspaceProject").textContent);
    $("workspaceProject").title = cwd;
    $("workspaceProject").disabled = !!state.selected || state.sending;
    $("workspaceProject").onclick = () => { if (!state.selected) chooseComposeProject(); };
    $("workspaceBranchControl").hidden = !cwd || projectless;
    $("workspaceBranch").textContent = state.creationBranch || value?.branch ||
      (value?.head ? t("Detached HEAD") + " · " + value.head.slice(0, 8) :
        value?.repository === false ? t("No Git repository") : t("Branch unknown"));
    $("workspaceBranch").title = error ? t(error) : t("Branch");
    $("workspaceBranch").setAttribute("aria-label", t("Branch") + ": " + $("workspaceBranch").textContent);
    $("workspaceBranch").disabled = !!state.selected || state.sending || !available || !value?.branches?.length || !!error;
    $("workspaceBranch").onclick = chooseBranch;
    if (cwd && !projectless && available && state.optionsLoaded && !state.agentReadPending && state.device?.online !== false && !pending && Date.now() - readAt > 10000)
      void loadWorkspace();
  }
  async function loadWorkspace(force = false) {
    if (pending) return pending;
    if (!force && Date.now() - readAt <= 10000) return value;
    const expected = scope, query = new URLSearchParams(
      state.selected ? { thread: state.selected } : { project: state.project },
    );
    readAt = Date.now();
    const request = api("workspace?" + query).then((result) => {
      if (expected !== context()) return null;
      if (!result || typeof result.cwd !== "string" || typeof result.repository !== "boolean" ||
          typeof result.branch !== "string" || !Array.isArray(result.branches) ||
          result.branches.some((branch) => typeof branch !== "string"))
        throw new Error("Unable to read the project's Git state.");
      value = result;
      error = "";
      return result;
    }).catch((e) => {
      if (expected === context()) error = e.message;
      return null;
    }).finally(() => {
      if (pending === request) pending = null;
      if (expected === context()) renderWorkspace();
    });
    pending = request;
    return request;
  }
  async function chooseBranch() {
    if (state.selected || state.projectless || !state.project || state.sending || state.catalog.capabilities?.workspace_git !== true) return;
    const expected = context(), result = await loadWorkspace(true);
    if (!result || expected !== context() || state.selected || state.sending) return;
    showMenu($("workspaceBranch"), [
      { heading: "New conversation branch" },
      { note: "Creating switches this folder's branch. Other conversations using this folder are affected." },
      ...result.branches.map((branch) => ({
        label: branch, icon: "branch", selected: branch === (state.creationBranch || result.branch),
        action: () => {
          if (expected !== context() || state.selected || state.sending) return;
          state.creationBranch = branch;
          renderWorkspace();
        },
      })),
    ]);
  }
  return { renderWorkspace };
}
