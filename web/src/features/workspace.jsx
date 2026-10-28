import {
  planBlockedWhileRunning,
  planRevisionRequest,
} from "./owner-capabilities";
import { renderView, clearView } from "../render";
import { Empty, EmptyMedia, EmptyDescription } from "../components/ui/empty";
import { RemoteIcon as Icon } from "../components/RemoteIcon";
import { FileTree } from "./files";
import {
  collectChanges,
  numberedDiff,
  normalizeFilePath,
  toolStatus,
  commandSummary,
  searchAction,
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
  readIndexes,
  locateRecord,
  openArtifact,
  Resource,
  Copy,
  jumpToItem,
  onChangesChanged,
  turnLabel,
  getChangedFiles,
  getConversationItems,
  renderSessionInfo,
  onPanelChange,
}) {
  function changedFiles() {
    return getChangedFiles ? getChangedFiles() : collectChanges(state);
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
    if (!$("changesPanel").hidden) renderInspector();
  }
  function activityRecords() {
    const names = {
      commandExecution: ["Command", "terminal"],
      mcpToolCall: ["Tool call", "tool"],
      dynamicToolCall: ["Tool call", "tool"],
      webSearch: ["Web search", "globe"],
      collabAgentToolCall: ["Agent", "agent"],
      collabToolCall: ["Agent", "agent"],
      legacyTool: ["Tool call", "tool"],
      fileChange: ["Changes", "diff"],
      error: ["Error", "warning"],
      hook: ["Hook", "tool"],
      systemEvent: ["System notice", "file"],
    };
    return getConversationItems()
      .filter((item) => names[item.type])
      .map((item) => {
        const data = item.data || {},
          [name, icon] = names[item.type],
          summary =
            item.type === "commandExecution"
              ? commandSummary(data, t) || data.command
              : item.type === "webSearch"
                ? searchAction(data).query
                : [data.server, data.tool || data.name]
                    .filter(Boolean)
                    .join(" / ") ||
                  item.text ||
                  data.message,
          status = toolStatus(item);
        return {
          item,
          name,
          icon,
          summary: typeof summary === "string" ? summary : "",
          status,
        };
      });
  }
  function renderInspector() {
    if (state.sideTab === "details") {
      const records = activityRecords(),
        tools = records.filter(
          ({ item }) =>
            !["fileChange", "error", "hook", "systemEvent"].includes(item.type),
        ),
        files = [
          ...new Map(changedFiles().map((file) => [file.path, file])).values(),
        ];
      renderSessionInfo($("detailsInfo"));
      renderView(
        $("detailsActivity"),
        <>
          <section className="inspector-card">
            <h3>
              {t("Tool usage")} <span className="count">{tools.length}</span>
            </h3>
            <p className="note">{t("Loaded records only")}</p>
            {tools.length ? (
              tools.map(({ item, name, icon, summary, status }) => (
                <TreeAction
                  key={item.id}
                  className="inspector-record"
                  action={() => showRecord(item.id)}
                >
                  <Icon name={icon} />
                  <span>
                    <strong>{t(name)}</strong>
                    <small>{summary || turnLabel(item.turn_id)}</small>
                  </span>
                  <span className="note">{recordStatus(status)}</span>
                </TreeAction>
              ))
            ) : (
              <p className="note">{t("No tool calls in loaded messages.")}</p>
            )}
          </section>
          <section className="inspector-card">
            <h3>
              {t("Changed files")} <span className="count">{files.length}</span>
              <Button variant="ghost" onClick={() => setPanelTab("changes")}>
                {t("View all")}
              </Button>
            </h3>
            {files.length ? (
              files.map((file) => (
                <TreeAction
                  key={file.path}
                  className="inspector-record inspector-file"
                  action={() => openChanges(file.path, file.key)}
                >
                  <Icon name="file" />
                  <span>{file.path}</span>
                  <DiffStats change={file} />
                </TreeAction>
              ))
            ) : (
              <p className="note">{t("No file changes yet.")}</p>
            )}
          </section>
        </>,
      );
    } else if (state.sideTab === "logs") {
      const records = activityRecords();
      renderView(
        $("logsContent"),
        <>
          <h3>
            {t("Execution log")} <span className="count">{records.length}</span>
          </h3>
          <p className="note">{t("Loaded messages and tool output only.")}</p>
          {records.length ? (
            records.map(({ item, name, icon, summary, status }) => (
              <TreeAction
                key={item.id}
                className="inspector-record inspector-log"
                action={() => showRecord(item.id)}
              >
                <Icon name={icon} />
                <span>
                  <strong>{t(name)}</strong>
                  <small>{summary || turnLabel(item.turn_id)}</small>
                  <small>
                    {turnLabel(item.turn_id)} · {recordStatus(status)}
                  </small>
                </span>
                <Icon name="external" />
              </TreeAction>
            ))
          ) : (
            <p className="note">
              {t("No execution records in loaded messages.")}
            </p>
          )}
        </>,
      );
    }
  }
  function recordStatus(status) {
    return t(
      {
        completed: "Completed",
        failed: "Failed",
        inProgress: "Running",
        running: "Running",
        starting: "Running",
        interrupted: "Interrupted",
        cancelled: "Cancelled",
      }[status] || "Status unknown",
    );
  }
  function showRecord(id) {
    if (matchMedia("(max-width: 1180px)").matches) closeChanges();
    jumpToItem(id);
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
              variant="default"
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

  let artifactScope = "",
    artifactTurn = "",
    artifactKind = "";
  function renderArtifacts() {
    if (artifactScope !== readIndexes.currentScope()) {
      artifactScope = readIndexes.currentScope();
      artifactTurn = artifactKind = "";
    }
    const supported = readIndexes.supports("artifact_index"),
      page = readIndexes.read("artifact_index", "artifacts", "artifacts"),
      indexedSources = new Set(page.items.map((artifact) => artifact.item_id)),
      artifacts = [
        ...(supported && page.loaded ? page.items : []),
        ...getArtifacts().filter(
          (artifact) =>
            !supported || !page.loaded || !indexedSources.has(artifact.item_id),
        ),
      ],
      groups = new Map();
    for (const artifact of artifacts) {
      const turn = artifact.turn_id || "",
        kind =
          artifact.kind ||
          (artifact.part?.type?.toLowerCase().includes("image")
            ? "image"
            : "file");
      if (artifactTurn && (turn || "unknown") !== artifactTurn) continue;
      if (artifactKind && kind !== artifactKind) continue;
      if (!groups.has(turn)) groups.set(turn, []);
      groups.get(turn).push(artifact);
    }
    $("artifactCount").textContent = String(artifacts.length);
    renderView(
      $("artifactsContent"),
      <>
        <p className="note">
          {t(
            supported && page.loaded && page.scope === "full"
              ? "Artifacts from readable history."
              : "Artifacts from loaded messages only.",
          )}
        </p>
        {supported && (
          <>
            {page.loading && (
              <p className="note">{t("Loading history index…")}</p>
            )}
            {page.error && (
              <p className="note" role="status">
                {t(page.error)}
              </p>
            )}
            {(page.truncated ||
              page.hasMore ||
              (page.loaded && page.scope !== "full")) && (
              <p className="note">{t("Results are incomplete.")}</p>
            )}
            <TreeAction
              disabled={page.loading}
              action={() =>
                readIndexes.load("artifact_index", "artifacts", "artifacts")
              }
            >
              {t(page.error ? "Retry" : "Load history artifacts")}
            </TreeAction>
            {page.hasMore && (
              <TreeAction
                disabled={page.loading}
                action={() =>
                  readIndexes.load(
                    "artifact_index",
                    "artifacts",
                    "artifacts",
                    undefined,
                    true,
                  )
                }
              >
                {t("Load more artifacts")}
              </TreeAction>
            )}
          </>
        )}
        {!!artifacts.length && (
          <div className="changes-controls">
            <select
              aria-label={t("Turn")}
              value={artifactTurn}
              onChange={(event) => {
                artifactTurn = event.currentTarget.value;
                renderArtifacts();
              }}
            >
              <option value="">{t("All turns")}</option>
              {[
                ...new Set(
                  artifacts.map((artifact) => artifact.turn_id || "unknown"),
                ),
              ].map((turn) => (
                <option key={turn} value={turn}>
                  {turnLabel(turn === "unknown" ? "" : turn)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("Artifact type")}
              value={artifactKind}
              onChange={(event) => {
                artifactKind = event.currentTarget.value;
                renderArtifacts();
              }}
            >
              <option value="">{t("All artifact types")}</option>
              {[
                ...new Set(
                  artifacts.map(
                    (artifact) =>
                      artifact.kind ||
                      (artifact.part?.type?.toLowerCase().includes("image")
                        ? "image"
                        : "file"),
                  ),
                ),
              ].map((kind) => (
                <option key={kind} value={kind}>
                  {t(
                    { image: "Image", file: "File", attachment: "Attachment" }[
                      kind
                    ] || "Unknown",
                  )}
                </option>
              ))}
            </select>
          </div>
        )}
        {groups.size ? (
          [...groups].map(([turn, values]) => (
            <section key={turn || "unknown"}>
              <h3>{turnLabel(turn)}</h3>
              {values.map((artifact) => (
                <div key={artifact.id || artifact.key}>
                  {artifact.id ? (
                    <div className="resource-card">
                      <strong>{artifact.name || t("Artifact")}</strong>
                      <span className="note">
                        {[
                          artifact.mime,
                          Number.isFinite(artifact.size)
                            ? artifact.size + " B"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <span className="note">
                        {t(
                          {
                            available: "Available",
                            unavailable: "Unavailable",
                            unknown: "Status unknown",
                          }[artifact.availability] || "Status unknown",
                        )}
                      </span>
                      {artifact.cut_reason && (
                        <span className="note">
                          {t(
                            {
                              deleted: "Resource was deleted.",
                              outside_project:
                                "Resource is outside the authorized project.",
                              truncated:
                                artifact.availability === "available"
                                  ? "Preview truncated. Download the complete file."
                                  : "Resource unavailable: output truncated.",
                              too_large: "Resource exceeds the 20 MB limit.",
                              unavailable:
                                "Resource unavailable in the authorized project or attachments.",
                            }[artifact.cut_reason] || "Status unknown",
                          )}
                        </span>
                      )}
                      <TreeAction
                        disabled={artifact.availability !== "available"}
                        action={() => openArtifact(artifact)}
                      >
                        {t(
                          artifact.kind === "image"
                            ? "View image"
                            : "Open file",
                        )}
                      </TreeAction>
                    </div>
                  ) : (
                    <Resource part={artifact.part} cut={artifact.cut} />
                  )}
                  {(artifact.item_id || artifact.turn_id) && (
                    <TreeAction
                      action={() =>
                        locateRecord({
                          item_id: artifact.item_id,
                          turn_id: artifact.turn_id,
                        })
                      }
                    >
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
              {t(
                supported && page.loaded
                  ? "No matching artifacts in this page."
                  : "No artifacts in loaded messages.",
              )}
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
    for (const name of ["details", "agents", "files", "changes", "logs", "artifacts"]) {
      $(name + "Tab").setAttribute("aria-selected", String(tab === name));
      $(name + "Tab").tabIndex = tab === name ? 0 : -1;
      $(name + "Content").hidden = tab !== name;
    }
    $("changesWarning").hidden = tab !== "changes" || !state.workspaceWarning;
    closeFilePreview();
    if (tab === "files") run(loadProjectFiles);
    else if (tab === "artifacts") renderArtifacts();
    else if (tab === "details" || tab === "logs") renderInspector();
    else renderChanges();
    onPanelChange();
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
    onPanelChange();
  }
  function resetSideData() {
    for (const id of ["detailsInfo", "detailsActivity", "logsContent"]) clearView($(id));
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
    if (state.live.pending_plan_approval === true) {
      state.pendingPlan = state.live.pending_plan || null;
      renderPlanAction();
      state.planToken = "";
      return;
    }
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
      if (state.live.pending_plan_approval === true) {
        if (id === state.selected && generation === state.generation) {
          state.pendingPlan = state.live.pending_plan || null;
          renderPlanAction();
        }
        return;
      }
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
    $("planAction").hidden =
      !state.pendingPlan || planBlockedWhileRunning(state);
    $("executePlan").disabled =
      !ownerCan("plan") || state.sending || state.planExecuting;
    $("continuePlanning").disabled =
      !ownerCan("plan") || state.sending || state.planExecuting;
  }
  function requestPlanRevision() {
    if (!ownerCan("plan")) return;
    if (
      !state.selected ||
      !state.pendingPlan ||
      planBlockedWhileRunning(state) ||
      state.sending
    )
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
      planBlockedWhileRunning(state) ||
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
    const fallback = {
      ...(nativeSettings() ? {} : state.prefs),
      mode: "plan",
      text:
        t(
          "Revise the previous plan using the following feedback. Return the complete updated plan and wait for my confirmation before implementation:",
        ) +
        "\n\n" +
        feedback,
    };
    const revision = planRevisionRequest(state, feedback, fallback);
    state.sending = true;
    $("confirmRevisePlan").disabled = true;
    $("cancelRevisePlan").disabled = true;
    $("planFeedback").disabled = true;
    $("planFeedbackError").textContent = "";
    updateControls();
    renderPlanAction();
    try {
      await api(
        "threads/" + encodeURIComponent(id) + "/" + revision.action,
        revision.payload,
      );
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
      planBlockedWhileRunning(state) ||
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
      planBlockedWhileRunning(state) ||
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
