import { renderView, clearView } from "../render";

export function createLifecycle({
  state,
  renderSessions,
  closeStream,
  resetSideData,
  closeDialog,
  closeMenu,
  closeChanges,
  hideSuggestions,
  $,
  t,
  updateControls,
  renderCurrent,
  getLanguage,
}) {
  function archiveConversation(id) {
    state.listSeq++;
    state.sessions = state.sessions.filter((session) => session.id !== id);
    renderSessions();
    if (id !== state.selected) return;
    closeStream();
    clearTimeout(state.timer);
    state.generation++;
    state.detailSeq++;
    state.optionsSeq++;
    state.selected = "";
    state.session = null;
    state.archivedSelection = id;
    state.ownerUnavailable = false;
    state.optionsLoaded = false;
    state.live = {};
    state.history = [];
    state.historyCursor = "";
    state.historyAnchor = "";
    state.historyPagingStarted = false;
    state.historyBoundary = "";
    state.legacyParts = [];
    state.historyCut = false;
    state.nativeHistory = false;
    state.prefs = {};
    state.settingsMutation = null;
    state.running = false;
    state.sending = false;
    state.turnID = "";
    state.currentRequests = [];
    state.requestKey = "";
    state.dismissedKey = "";
    resetSideData();
    closeDialog();
    closeMenu();
    closeChanges();
    hideSuggestions();
    for (const node of ["history", "live", "planProgress"]) clearView($(node));
    $("title").textContent = t("Archived conversation");
    $("cwd").textContent = "";
    $("older").hidden = true;
    $("working").hidden = true;
    $("planProgress").hidden = true;
    updateControls();
  }
  function unavailableConversation(message) {
    closeStream();
    clearTimeout(state.timer);
    state.generation++;
    state.detailSeq++;
    state.optionsSeq++;
    state.ownerUnavailable = true;
    state.sending = false;
    state.settingsMutation = null;
    state.queueMutation = null;
    state.connectingOwner?.controller?.abort();
    state.connectingOwner = false;
    state.live = {
      ...state.live,
      status: "unknown",
      requests: [],
      owner: {
        ...state.live.owner,
        state: "offline",
        notice:
          message ||
          "Unable to verify the conversation archive status. Refresh to retry.",
        capabilities: {},
      },
    };
    renderCurrent();
    clearTimeout(state.timer);
  }
  function renderContext() {
    const context = state.live.context,
      available = !!state.selected && !!context;
    $("contextUsage").hidden = !available;
    if (
      $("contextUsageDialog").open &&
      (!available || $("contextUsageDialog").dataset.thread !== state.selected)
    )
      $("contextUsageDialog").close();
    if (!available) {
      $("contextBar").hidden = true;
      return;
    }
    const number = (value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0
        ? value
        : null;
    const used = number(context.used_tokens),
      total = number(context.window_tokens),
      provided = number(context.used_percent),
      percent =
        provided !== null
          ? provided
          : used !== null && total > 0
            ? (100 * used) / total
            : null;
    const format = (value) =>
      value === null
        ? t("Unknown")
        : value.toLocaleString(
            getLanguage() === "zh" ? "zh-CN" : getLanguage(),
          );
    const summary =
      t("Context") +
      " · " +
      format(used) +
      " / " +
      format(total) +
      (percent !== null
        ? " · " +
          (Math.round(percent * 10) / 10).toLocaleString(
            getLanguage() === "zh" ? "zh-CN" : getLanguage(),
          ) +
          "%"
        : " · " + t("Unknown"));
    $("contextUsageText").textContent = summary;
    $("contextUsage").title = summary;
    $("contextUsage").setAttribute("aria-label", summary);
    const progress = percent === null ? 0 : Math.max(0, Math.min(100, percent));
    $("contextUsage").dataset.unknown = String(percent === null);
    $("contextUsage").dataset.level =
      progress >= 95 ? "full" : progress >= 80 ? "high" : "";
    $("contextUsageRing").style.strokeDasharray =
      percent === null ? "3 8" : "100";
    $("contextUsageRing").style.strokeDashoffset = String(100 - progress);
    $("contextUsageSummary").textContent = summary;
    renderView(
      $("contextUsageDetail"),
      <>
        <dt>{t("Used tokens")}</dt>
        <dd>{format(used)}</dd>
        <dt>{t("Context window")}</dt>
        <dd>{format(total)}</dd>
      </>,
    );
    const compaction = context.compaction || {};
    $("contextCompaction").hidden = !["inProgress", "completed"].includes(
      compaction.status,
    );
    $("contextBar").hidden = $("contextCompaction").hidden;
    $("contextCompaction").textContent = t(
      compaction.status === "inProgress"
        ? "Compacting context…"
        : "Context compacted",
    );
    $("contextCompaction").dataset.status = compaction.status || "";
  }

  return { archiveConversation, unavailableConversation, renderContext };
}
