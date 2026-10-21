import { renderView, clearView } from "../render";
import { Empty, EmptyMedia, EmptyDescription } from "../components/ui/empty";
import { RemoteIcon as Icon } from "../components/RemoteIcon";
import { useRef } from "react";
import { Button } from "../components/ui/button";

export function createWorkspace({
  state,
  $,
  t,
  displayDiff,
  DiffStats,
  run,
  openProjectFile,
  closeFilePreview,
  loadProjectFiles,
  resetQueue,
  resetSubagents,
  api,
  notice,
  ownerCan,
  ownerEpoch,
  requireOwner,
  nativeSettings,
  updateControls,
  detail,
  ensureStream,
  permissionLabel,
}) {
  function normalizedFilePath(path) {
    const cwd = (state.cwd || state.project)
      .replace(/\\/g, "/")
      .replace(/\/$/, "");
    path = String(path || "").replace(/\\/g, "/");
    if (path.startsWith(cwd + "/")) path = path.slice(cwd.length + 1);
    return path.replace(/^\.\//, "");
  }
  function changedFiles() {
    const items = new Map(),
      liveIDs = new Set((state.live.items || []).map((item) => item.id));
    for (const item of [...state.history, ...(state.live.items || [])])
      items.set(item.id, item);
    let files = [];
    for (const item of items.values())
      if (item.type === "fileChange")
        for (const [index, change] of (item.data?.changes || []).entries())
          files.push({
            ...change,
            path: normalizedFilePath(change.path),
            key: item.id + "|" + index,
            turn_id:
              item.turn_id ||
              (liveIDs.has(item.id) ? state.live.turn_id : "") ||
              "",
          });
    if (state.live.diff) {
      const aggregated = [];
      for (const chunk of state.live.diff
        .split(/(?=^diff --git )/m)
        .filter(Boolean)) {
        const match =
          chunk.match(/^\+\+\+ b\/(.+)$/m) ||
          chunk.match(/^diff --git a\/(.+) b\//m);
        if (match)
          aggregated.push({
            path: normalizedFilePath(match[1]),
            diff: chunk,
            key: "aggregate|" + normalizedFilePath(match[1]),
            turn_id: state.live.turn_id,
          });
      }
      if (aggregated.length)
        files = [
          ...files.filter((file) => file.turn_id !== state.live.turn_id),
          ...aggregated,
        ];
    }
    const merged = new Map();
    for (const file of files)
      merged.set((file.turn_id || "history") + "|" + file.path, file);
    for (const change of state.workspaceChanges) {
      const path = normalizedFilePath(change.path),
        key = (change.turn_id || "workspace") + "|" + path;
      merged.set(key, { ...change, path, key: "workspace|" + key });
    }
    return [...merged.values()];
  }
  function renderChanges() {
    const files = changedFiles();
    $("changeCount").textContent = String(
      new Set(files.map((file) => file.path)).size,
    );
    $("changesWarning").hidden =
      state.sideTab !== "changes" || !state.workspaceWarning;
    $("changesWarning").textContent = state.workspaceWarning;
    renderView(
      $("changesContent"),
      files.length ? (
        files.map((file) => (
          <DiffFile
            key={file.key}
            file={file}
            initialOpen={files.length <= 4}
          />
        ))
      ) : (
        <Empty className="empty-changes">
          <EmptyMedia variant="icon">
            <Icon name="diff" />
          </EmptyMedia>
          <EmptyDescription>{t("No file changes yet.")}</EmptyDescription>
          <EmptyDescription>
            {t("Files changed by Codex will appear here.")}
          </EmptyDescription>
        </Empty>
      ),
    );
  }
  function DiffFile({ file, initialOpen }) {
    const open = useRef(initialOpen),
      diff = displayDiff(file).text;
    return (
      <details
        className="diff-file"
        data-slot="diff-view"
        data-path={file.path}
        data-record={file.key}
        open={open.current}
      >
        <summary>
          <Icon name="file" />
          <span>{file.path}</span>
          <DiffStats change={file} />
          {(typeof file.kind === "string" ? file.kind : file.kind?.type) !==
            "delete" && (
            <Button
              variant="glass"
              type="button"
              className="icon-button preview-file-button"
              aria-label={t("Open file") + " " + file.path}
              title={t("Open file")}
              onClick={(event) => {
                event.preventDefault();
                run(() => openProjectFile(file.path), event.currentTarget);
              }}
            >
              <Icon name="external" />
            </Button>
          )}
        </summary>
        {diff ? (
          <pre>
            {diff.split("\n").map((line, index) => (
              <span
                key={index}
                className={
                  "diff-line " +
                  (line.startsWith("@@")
                    ? "hunk"
                    : line.startsWith("+")
                      ? "add"
                      : line.startsWith("-")
                        ? "delete"
                        : "")
                }
              >
                {line || " "}
              </span>
            ))}
          </pre>
        ) : (
          <p className="diff-empty">
            {t(
              file.binary
                ? "Binary file. Download to view it."
                : "No textual diff is available.",
            )}
          </p>
        )}
        {file.truncated && (
          <p className="diff-empty">
            {t("Preview truncated. Download the complete file.")}
          </p>
        )}
      </details>
    );
  }

  function openPanel(tab = "changes") {
    $("changesPanel").hidden = false;
    $("workspace").classList.add("has-changes");
    $("changesToggle").setAttribute("aria-expanded", "true");
    setPanelTab(tab);
  }
  function setPanelTab(tab) {
    state.sideTab = tab;
    $("changesTab").setAttribute("aria-selected", String(tab === "changes"));
    $("filesTab").setAttribute("aria-selected", String(tab === "files"));
    $("changesContent").hidden = tab !== "changes";
    $("filesContent").hidden = tab !== "files";
    $("changesWarning").hidden = tab !== "changes" || !state.workspaceWarning;
    closeFilePreview();
    if (tab === "files") run(loadProjectFiles);
    else renderChanges();
  }
  function openChanges(path, record) {
    openPanel("changes");
    if (path)
      for (const node of $("changesContent").children)
        if (
          record
            ? node.dataset.record === record ||
              node.dataset.record === "aggregate|" + path
            : node.dataset.path === path
        )
          node.open = true;
  }
  function closeChanges() {
    $("changesPanel").hidden = true;
    $("workspace").classList.remove("has-changes");
    $("changesToggle").setAttribute("aria-expanded", "false");
  }
  function resetSideData() {
    resetSubagents();
    if ($("revisePlanDialog").open) $("revisePlanDialog").close();
    $("revisePlanDialog").dataset.planId = "";
    $("planFeedback").value = "";
    $("planFeedbackError").textContent = "";
    resetQueue();
    clearTimeout(state.workspaceTimer);
    state.workspaceChanges = [];
    state.workspaceWarning = "";
    state.workspaceToken = "";
    state.workspaceFetch = null;
    state.workspaceQueued = false;
    state.pendingPlan = null;
    state.planToken = "";
    state.planFetch = null;
    state.cwd = "";
    state.filesSeq++;
    closeFilePreview();
    clearView($("fileList"));
    $("planAction").hidden = true;
    if ($("executePlanDialog").open) $("executePlanDialog").close();
  }
  async function refreshWorkspaceChanges(force = false) {
    if (!state.selected) return;
    const id = state.selected,
      generation = state.generation,
      token = [
        id,
        state.live.workspace_revision || 0,
        state.live.turn_id || "",
        state.live.status || "",
      ].join("|");
    if (!force && state.workspaceToken === token) return;
    if (state.workspaceFetch) {
      state.workspaceQueued = true;
      return;
    }
    const request = {};
    state.workspaceFetch = request;
    try {
      const value = await api("threads/" + encodeURIComponent(id) + "/changes");
      if (id !== state.selected || generation !== state.generation) return;
      state.workspaceChanges = value.changes || [];
      state.workspaceWarning = value.warning || "";
      state.workspaceToken = token;
      renderChanges();
      if (value.pending && !state.stream) {
        clearTimeout(state.workspaceTimer);
        state.workspaceTimer = setTimeout(
          () => refreshWorkspaceChanges(true),
          1500,
        );
      }
    } catch (error) {
      if (id === state.selected && generation === state.generation) {
        state.workspaceToken = token;
        state.workspaceWarning =
          t("Unable to load changes.") + " " + error.message;
        renderChanges();
      }
    } finally {
      if (state.workspaceFetch === request) {
        state.workspaceFetch = null;
        if (state.workspaceQueued) {
          state.workspaceQueued = false;
          refreshWorkspaceChanges();
        }
      }
    }
  }
  async function refreshPendingPlan(force = false) {
    if (!state.selected) return;
    if (state.running) {
      state.pendingPlan = null;
      renderPlanAction();
      state.planToken = "";
      return;
    }
    const id = state.selected,
      generation = state.generation,
      token = [id, state.live.turn_id || "", state.live.status || ""].join("|");
    if ((!force && state.planToken === token) || state.planFetch) return;
    const request = {};
    state.planFetch = request;
    try {
      const value = await api("threads/" + encodeURIComponent(id) + "/plan");
      if (
        id !== state.selected ||
        generation !== state.generation ||
        state.running
      )
        return;
      state.pendingPlan = value.pending_plan || null;
      state.planToken = token;
      renderPlanAction();
    } catch (error) {
      if (id === state.selected && generation === state.generation) {
        state.planToken = token;
        notice(t("Unable to check the plan.") + " " + error.message);
      }
    } finally {
      if (state.planFetch === request) {
        state.planFetch = null;
        if (
          id === state.selected &&
          generation === state.generation &&
          !state.running &&
          token !==
            [id, state.live.turn_id || "", state.live.status || ""].join("|")
        )
          refreshPendingPlan();
      }
    }
  }
  function renderPlanAction() {
    $("planAction").hidden = !state.pendingPlan || state.running;
    $("executePlan").disabled =
      !ownerCan("plan") || state.sending || state.planExecuting;
    $("continuePlanning").disabled =
      !ownerCan("plan") || state.sending || state.planExecuting;
  }
  function requestPlanRevision() {
    if (!ownerCan("plan")) return;
    if (!state.selected || !state.pendingPlan || state.running || state.sending)
      return;
    const dialog = $("revisePlanDialog");
    if (dialog.dataset.planId !== state.pendingPlan.id)
      $("planFeedback").value = "";
    Object.assign(dialog.dataset, {
      threadId: state.selected,
      generation: String(state.generation),
      planId: state.pendingPlan.id,
      ownerEpoch: ownerEpoch(),
    });
    $("planFeedbackError").textContent = "";
    if (!dialog.open) dialog.showModal();
    $("planFeedback").focus({ preventScroll: true });
  }
  async function revisePendingPlan() {
    requireOwner("plan");
    const dialog = $("revisePlanDialog"),
      feedback = $("planFeedback").value.trim();
    if (!dialog.open || state.sending || state.settingsMutation || !feedback)
      return;
    if (
      state.running ||
      !state.pendingPlan ||
      dialog.dataset.threadId !== state.selected ||
      dialog.dataset.generation !== String(state.generation) ||
      dialog.dataset.planId !== state.pendingPlan.id ||
      dialog.dataset.ownerEpoch !== ownerEpoch()
    ) {
      $("planFeedbackError").textContent = t(
        "The plan changed. Close this dialog and review the latest conversation.",
      );
      return;
    }
    const id = state.selected,
      generation = state.generation,
      planId = state.pendingPlan.id;
    const payload = {
      ...(nativeSettings() ? {} : state.prefs),
      mode: "plan",
      text:
        t(
          "Revise the previous plan using the following feedback. Return the complete updated plan and wait for my confirmation before implementation:",
        ) +
        "\n\n" +
        feedback,
    };
    state.sending = true;
    $("confirmRevisePlan").disabled = true;
    $("cancelRevisePlan").disabled = true;
    $("planFeedback").disabled = true;
    $("planFeedbackError").textContent = "";
    updateControls();
    renderPlanAction();
    try {
      await api("threads/" + encodeURIComponent(id) + "/turn", payload);
      if (id !== state.selected || generation !== state.generation) return;
      if (state.pendingPlan?.id === planId) state.pendingPlan = null;
      state.planToken = "";
      state.prefs.mode = "plan";
      dialog.close();
      $("planFeedback").value = "";
      renderPlanAction();
      await detail(generation);
      ensureStream();
    } catch (error) {
      if (id === state.selected && generation === state.generation)
        $("planFeedbackError").textContent = t(error.message);
      throw error;
    } finally {
      state.sending = false;
      $("confirmRevisePlan").disabled = false;
      $("cancelRevisePlan").disabled = false;
      $("planFeedback").disabled = false;
      updateControls();
      renderPlanAction();
    }
  }
  function requestPlanExecution() {
    if (!ownerCan("plan")) return;
    if (
      !state.pendingPlan ||
      state.running ||
      state.planExecuting ||
      state.settingsMutation
    )
      return;
    $("executePlanPermissions").textContent =
      t("Computer permissions") + ": " + t(permissionLabel());
    $("executePlanDialog").dataset.planId = state.pendingPlan.id;
    $("executePlanDialog").dataset.ownerEpoch = ownerEpoch();
    if (!$("executePlanDialog").open) $("executePlanDialog").showModal();
  }
  async function executePendingPlan() {
    requireOwner("plan");
    if (
      state.planExecuting ||
      state.sending ||
      state.settingsMutation ||
      state.running ||
      !state.pendingPlan ||
      $("executePlanDialog").dataset.planId !== state.pendingPlan.id ||
      $("executePlanDialog").dataset.ownerEpoch !== ownerEpoch()
    )
      return;
    const id = state.selected,
      generation = state.generation,
      payload = { plan_id: state.pendingPlan.id };
    for (const key of ["model", "effort", "permission"])
      if (state.prefs[key]) payload[key] = state.prefs[key];
    if (!payload.permission && !nativeSettings())
      payload.permission = "read-only";
    state.planExecuting = true;
    state.sending = true;
    $("confirmExecutePlan").disabled = true;
    $("cancelExecutePlan").disabled = true;
    updateControls();
    renderPlanAction();
    try {
      await api("threads/" + encodeURIComponent(id) + "/execute-plan", payload);
      if (id !== state.selected || generation !== state.generation) return;
      state.pendingPlan = null;
      state.prefs.mode = "default";
      $("executePlanDialog").close();
      renderPlanAction();
      await detail(generation);
      ensureStream();
    } finally {
      state.planExecuting = false;
      state.sending = false;
      $("confirmExecutePlan").disabled = false;
      $("cancelExecutePlan").disabled = false;
      updateControls();
      renderPlanAction();
    }
  }

  return {
    resetSideData,
    closeChanges,
    renderChanges,
    renderPlanAction,
    refreshWorkspaceChanges,
    refreshPendingPlan,
    openChanges,
    openPanel,
    setPanelTab,
    requestPlanExecution,
    executePendingPlan,
    requestPlanRevision,
    revisePendingPlan,
  };
}
