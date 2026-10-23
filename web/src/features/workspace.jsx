import { renderView, clearView } from "../render";
import { Empty, EmptyMedia, EmptyDescription } from "../components/ui/empty";
import { RemoteIcon as Icon } from "../components/RemoteIcon";
import { FileTree } from "./files";
import {
  collectChanges,
  numberedDiff,
  normalizeFilePath,
} from "./presentation";
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
  getReadingState,
  onReadingChange,
  getArtifacts,
  Resource,
  Copy,
  jumpToItem,
  onChangesChanged,
  turnLabel,
}) {
  function changedFiles() {
    return collectChanges(state);
  }
  function TreeAction({ action, ...props }) {
    return (
      <Button
        variant="ghost"
        type="button"
        {...props}
        onClick={(event) => run(action, event.currentTarget)}
      />
    );
  }
  function renderChanges() {
    const files = changedFiles(),
      reading = getReadingState(),
      changesTurn = reading.changesTurn || "",
      changesTree = !!reading.changesTree;
    $("changeCount").textContent = String(
      new Set(files.map((file) => file.path)).size,
    );
    $("changesWarning").hidden =
      state.sideTab !== "changes" || !state.workspaceWarning;
    $("changesWarning").textContent = state.workspaceWarning;
    renderView(
      $("changesContent"),
      <>
        {state.workspacePending && (
          <p className="note" role="status">
            {t("Reading changes…")}
          </p>
        )}
        {files.length ? (
          <>
            <div
              className="changes-controls"
              role="group"
              aria-label={t("Filter changes")}
            >
              <Button
                variant="ghost"
                aria-pressed={!changesTurn}
                onClick={() => {
                  reading.changesTurn = "";
                  onReadingChange();
                  renderChanges();
                }}
              >
                {t("All turns")}
              </Button>
              {[...new Set(files.map((file) => file.turn_id))].map(
                (turn, index) => (
                  <Button
                    variant="ghost"
                    key={turn || "unknown"}
                    aria-pressed={changesTurn === (turn || "unknown")}
                    onClick={() => {
                      reading.changesTurn = turn || "unknown";
                      onReadingChange();
                      renderChanges();
                    }}
                  >
                    {turnLabel(turn)}
                  </Button>
                ),
              )}
              <Button
                variant="ghost"
                aria-pressed={changesTree}
                onClick={() => {
                  reading.changesTree = !changesTree;
                  onReadingChange();
                  renderChanges();
                }}
              >
                {t(changesTree ? "File list" : "File tree")}
              </Button>
            </div>
            {changesTree && (
              <FileTree
                files={files
                  .filter(
                    (file) =>
                      !changesTurn ||
                      (file.turn_id || "unknown") === changesTurn,
                  )
                  .map((file) => ({
                    ...file,
                    relative: file.path,
                    changeKey: file.key,
                  }))}
                Action={TreeAction}
                onOpenFile={(path, file) => openChanges(path, file?.changeKey)}
              />
            )}
            {files.map((file) => (
              <div
                key={state.generation + "|" + file.key}
                hidden={
                  !!changesTurn && (file.turn_id || "unknown") !== changesTurn
                }
                className="change-record"
              >
                <p className="change-source">
                  {t(
                    file.turn_id && file.turn_id === state.live.turn_id
                      ? "Current turn"
                      : "Historical changes",
                  )}{" "}
                  · {t("Recorded diff")}
                </p>
                <DiffFile file={file} initialOpen={files.length <= 4} />
              </div>
            ))}
          </>
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
        )}
      </>,
    );
    renderArtifacts();
  }
  function DiffFile({ file, initialOpen }) {
    const reading = getReadingState(),
      expanded = reading.diffExpanded || (reading.diffExpanded = {}),
      diff = displayDiff(file).text,
      kind = typeof file.kind === "string" ? file.kind : file.kind?.type,
      oldPath = file.old_path || "",
      newPath = file.path;
    return (
      <details
        className="diff-file"
        data-slot="diff-view"
        data-path={file.path}
        data-record={file.key}
        open={expanded[file.key] ?? initialOpen}
        onToggle={(event) => {
          expanded[file.key] = event.currentTarget.open;
          onReadingChange();
        }}
      >
        <summary>
          <Icon name="file" />
          <span>
            {oldPath && oldPath !== newPath ? oldPath + " → " : ""}
            {newPath}
          </span>
          <span className="change-kind">
            {t(
              oldPath && oldPath !== newPath
                ? "Renamed"
                : { add: "Added", delete: "Deleted", update: "Modified" }[
                    kind
                  ] || "Modified",
            )}
          </span>
          <DiffStats change={file} />
          {kind !== "delete" && (
            <Button
              variant="glass"
              type="button"
              className="icon-button preview-file-button"
              aria-label={t("Open file") + " " + file.path}
              title={t("Current file content")}
              onClick={(event) => {
                event.preventDefault();
                run(() => openProjectFile(newPath), event.currentTarget);
              }}
            >
              <Icon name="external" />
            </Button>
          )}
        </summary>
        {diff && <Copy text={diff} label="Copy diff" />}
        {file.binary && (
          <p className="diff-empty">{t("Binary file. Download to view it.")}</p>
        )}
        {diff ? (
          <pre>
            {numberedDiff(diff, kind).map((row, index) => (
              <span key={index} className={"diff-line " + (row.kind || "")}>
                <span className="diff-number" aria-label={t("Old line")}>
                  {row.old ?? ""}
                </span>
                <span className="diff-number" aria-label={t("New line")}>
                  {row.next ?? ""}
                </span>
                <span>{row.text || " "}</span>
              </span>
            ))}
          </pre>
        ) : (
          !file.binary && (
            <p className="diff-empty">{t("No textual diff is available.")}</p>
          )
        )}
        {file.truncated && <p className="diff-empty">{t("Diff truncated.")}</p>}
      </details>
    );
  }

  function renderArtifacts() {
    const artifacts = getArtifacts(),
      groups = new Map();
    for (const artifact of artifacts) {
      const turn = artifact.turn_id || "";
      if (!groups.has(turn)) groups.set(turn, []);
      groups.get(turn).push(artifact);
    }
    $("artifactCount").textContent = String(artifacts.length);
    renderView(
      $("artifactsContent"),
      <>
        <p className="note">{t("Artifacts from loaded messages only.")}</p>
        {artifacts.length ? (
          [...groups].map(([turn, values], index) => (
            <section key={turn || "unknown"}>
              <h3>{turnLabel(turn)}</h3>
              {values.map((artifact) => (
                <div key={artifact.key}>
                  <Resource part={artifact.part} cut={artifact.cut} />
                  {artifact.item_id && (
                    <TreeAction action={() => jumpToItem(artifact.item_id)}>
                      {t("Jump to source")}
                    </TreeAction>
                  )}
                </div>
              ))}
            </section>
          ))
        ) : (
          <Empty className="empty-changes">
            <EmptyMedia variant="icon">
              <Icon name="file" />
            </EmptyMedia>
            <EmptyDescription>
              {t("No artifacts in loaded messages.")}
            </EmptyDescription>
          </Empty>
        )}
      </>,
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
    $("artifactsTab").setAttribute(
      "aria-selected",
      String(tab === "artifacts"),
    );
    $("changesContent").hidden = tab !== "changes";
    $("filesContent").hidden = tab !== "files";
    $("artifactsContent").hidden = tab !== "artifacts";
    $("changesWarning").hidden = tab !== "changes" || !state.workspaceWarning;
    closeFilePreview();
    if (tab === "files") run(loadProjectFiles);
    else if (tab === "artifacts") renderArtifacts();
    else renderChanges();
  }
  function openChanges(path, record) {
    if (path) path = normalizeFilePath(path, state.cwd || state.project);
    const reading = getReadingState(),
      files = changedFiles(),
      matches = files.filter((file) =>
        record
          ? file.key === record ||
            (file.item_id &&
              record.startsWith(file.item_id + "|") &&
              (file.path === path || file.old_path === path))
          : file.path === path,
      ),
      keys = new Set(
        (matches.length
          ? matches
          : files.filter((file) => file.path === path || file.old_path === path)
        ).map((file) => file.key),
      );
    if (path) {
      reading.changesTurn = "";
      for (const key of keys)
        (reading.diffExpanded || (reading.diffExpanded = {}))[key] = true;
      onReadingChange();
    }
    openPanel("changes");
    if (path)
      for (const node of $("changesContent").querySelectorAll(
        "details[data-record]",
      ))
        if (keys.has(node.dataset.record)) {
          node.open = true;
          const content = $("changesContent");
          content.scrollTop +=
            node.getBoundingClientRect().top -
            content.getBoundingClientRect().top;
          break;
        }
  }
  function openTurnChanges(turnID) {
    getReadingState().changesTurn = turnID || "unknown";
    onReadingChange();
    openPanel("changes");
  }
  function closeChanges() {
    $("changesPanel").hidden = true;
    $("workspace").classList.remove("has-changes");
    $("changesToggle").setAttribute("aria-expanded", "false");
  }
  function resetSideData() {
    if ($("sessionInfoDialog").open) $("sessionInfoDialog").close();
    resetSubagents();
    if ($("revisePlanDialog").open) $("revisePlanDialog").close();
    $("revisePlanDialog").dataset.planId = "";
    $("planFeedback").value = "";
    $("planFeedbackError").textContent = "";
    resetQueue();
    clearTimeout(state.workspaceTimer);
    state.workspaceChanges = [];
    state.workspaceWarning = "";
    state.workspacePending = false;
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
      state.workspacePending = value.pending === true;
      state.workspaceToken = token;
      renderChanges();
      onChangesChanged();
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
        state.workspacePending = false;
        renderChanges();
        onChangesChanged();
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
    renderArtifacts,
    changedFiles,
    renderPlanAction,
    refreshWorkspaceChanges,
    refreshPendingPlan,
    openChanges,
    openTurnChanges,
    openPanel,
    setPanelTab,
    requestPlanExecution,
    executePendingPlan,
    requestPlanRevision,
    revisePendingPlan,
  };
}
