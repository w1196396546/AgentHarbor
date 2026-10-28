import { renderView, clearView } from "../render";
import { messageCapability } from "./owner-capabilities";

export function bindWorkspace({
  $,
  closeMenu,
  chooseComposeProject,
  setNavigation,
  run,
  state,
  list,
  detail,
  refreshWorkspaceChanges,
  refreshPendingPlan,
  refreshQueue,
  api,
  mergeOrdered,
  renderSessions,
  create,
  showMenu,
  openReasoning,
  modeMenu,
  modelMenu,
  closeReasoning,
  canConfigure,
  reasoningEfforts,
  getAgent,
  reasoningModel,
  renderReasoning,
  commitReasoning,
  reasoningDefault,
  applyPreferences,
  renderContext,
  permissionMenu,
  ownerCan,
  ownerEpoch,
  updateControls,
  submit,
  resizeComposer,
  suggest,
  saveQueueEdit,
  updateQueueEdit,
  cancelQueueEdit,
  renderQueue,
  drawSuggestions,
  pickSuggestion,
  hideSuggestions,
  upload,
  connectOriginalOwner,
  updateLatest,
  mutateQueue,
  openChanges,
  closeChanges,
  setPanelTab,
  openPanel,
  loadProjectFiles,
  closeFilePreview,
  requestPlanExecution,
  executePendingPlan,
  requestPlanRevision,
  revisePendingPlan,
  dismissRequest,
  openRequest,
  checkDevice,
  discardDraft,
  clearDraft,
  showPair,
  renderDevice,
  supportedLanguages,
  getLanguage,
  setLanguage,
  translate,
  ensureStream,
  poll,
  closeStream,
  positionReasoning,
  renderChanges,
}) {
  $("breadcrumbProject").onclick = chooseComposeProject;
  $("sidebarToggle").onclick = () =>
    setNavigation(!document.body.classList.contains("nav-open"));
  $("navBackdrop").onclick = () => setNavigation(false);
  $("refresh").onclick = () =>
    run(async () => {
      state.optionsLoaded = false;
      await checkDevice(true);
      if (state.selected) {
        await detail(state.generation);
        await Promise.all([
          refreshWorkspaceChanges(true),
          refreshPendingPlan(true),
          refreshQueue(true),
        ]);
      }
    }, $("refresh"));
  $("older").onclick = () =>
    run(async () => {
      const id = state.selected,
        generation = state.generation,
        cursor = state.historyCursor,
        anchor = state.historyAnchor;
      if (!cursor) return;
      const page = await api(
        "sessions/" +
          encodeURIComponent(id) +
          "/history?" +
          new URLSearchParams({ cursor }),
      );
      if (
        id !== state.selected ||
        generation !== state.generation ||
        cursor !== state.historyCursor
      )
        return;
      state.history = mergeOrdered(
        state.history,
        page.items || [],
        true,
        anchor,
      );
      state.historyCursor = page.next_cursor || "";
      state.historyAnchor = page.items?.[0]?.id || anchor;
      $("older").hidden = !page.has_more;
      await detail(generation);
    }, $("older"));
  $("more").onclick = () => run(() => list(true), $("more"));
  $("search").oninput = renderSessions;
  $("new").onclick = () => run(() => create(true), $("new"));
  $("startChat").onclick = () => run(create, $("startChat"));
  $("capabilityIssue").onclick = () =>
    showMenu($("capabilityIssue"), [
      { heading: "Some integrations are unavailable" },
      ...(state.catalog.errors || []).map((error) => ({ note: error })),
    ]);
  $("model").onclick = () => openReasoning($("model"));
  $("effort").onclick = () => openReasoning($("effort"));
  $("mode").onclick = modeMenu;
  $("reasoningModel").onclick = () => {
    state.reasoningPreview = null;
    modelMenu($("reasoningModel"));
  };
  $("closeReasoning").onclick = () => closeReasoning();
  $("reasoningRange").oninput = () => {
    if (!canConfigure() || $("reasoningCard").hidden) return;
    const entry = reasoningEfforts()[Number($("reasoningRange").value)];
    if (entry) {
      state.reasoningPreview = {
        model: getAgent().modelID(reasoningModel()),
        effort: entry.reasoningEffort,
      };
      renderReasoning();
    }
  };
  $("reasoningRange").onchange = commitReasoning;
  $("reasoningReset").onclick = () => {
    if (!canConfigure()) return;
    const effort = reasoningDefault();
    if (effort) {
      state.reasoningPreview = null;
      run(() => applyPreferences({ effort }), $("reasoningReset"));
    }
  };
  $("contextUsage").onclick = () => {
    closeReasoning(false);
    renderContext();
    if (!$("contextUsage").hidden) {
      $("contextUsageDialog").dataset.thread = state.selected;
      $("contextUsageDialog").showModal();
    }
  };
  $("closeContextUsage").onclick = () => $("contextUsageDialog").close();
  $("permission").onclick = permissionMenu;
  $("confirmPermission").onclick = () =>
    run(async () => {
      if (
        !ownerCan("configure") ||
        $("permissionDialog").dataset.ownerEpoch !== ownerEpoch()
      )
        return;
      await applyPreferences({ permission: "full-access" });
      $("permissionDialog").close();
      updateControls();
    }, $("confirmPermission"));
  $("cancelPermission").onclick = () => $("permissionDialog").close();
  $("composer").onsubmit = (e) => {
    e.preventDefault();
    run(submit);
  };
  $("message").oninput = () => {
    resizeComposer();
    updateControls();
    suggest();
  };
  $("message").onkeyup = (e) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) suggest();
  };
  $("queueEditForm").onsubmit = (e) => {
    e.preventDefault();
    run(saveQueueEdit, $("saveQueueEdit"));
  };
  $("queueEditText").oninput = updateQueueEdit;
  $("cancelQueueEdit").onclick = cancelQueueEdit;
  $("queueEditDialog").addEventListener("cancel", (e) => {
    if (state.queueMutation) e.preventDefault();
  });
  $("queueEditDialog").addEventListener("close", () => {
    if (state.queueEdit && !state.queueMutation) {
      state.queueEdit = null;
      renderQueue();
    }
  });
  $("message").onkeydown = (e) => {
    if (!$("suggestions").hidden) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        state.suggestionIndex =
          (state.suggestionIndex +
            (e.key === "ArrowDown" ? 1 : -1) +
            state.suggestions.length) %
          Math.max(1, state.suggestions.length);
        drawSuggestions();
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickSuggestion(state.suggestionIndex);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        hideSuggestions();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!$("send").disabled) run(submit);
    }
  };
  $("attach").onclick = () => {
    if (ownerCan(messageCapability(state))) $("fileInput").click();
  };
  $("fileInput").onchange = () => {
    run(() => upload([...$("fileInput").files]));
    $("fileInput").value = "";
  };
  $("message").onpaste = (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      e.preventDefault();
      run(() => upload(files));
    }
  };
  $("composer").ondragover = (e) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      $("composer").classList.add("dragging");
    }
  };
  $("composer").ondragleave = () => $("composer").classList.remove("dragging");
  $("composer").ondrop = (e) => {
    if (e.dataTransfer.files.length) {
      e.preventDefault();
      $("composer").classList.remove("dragging");
      run(() => upload([...e.dataTransfer.files]));
    }
  };
  $("connectOwner").onclick = () => run(() => connectOriginalOwner());
  $("stop").onclick = () => {
    const id = state.selected,
      generation = state.generation,
      turn = state.turnID;
    return run(async () => {
      await api(
        "threads/" + encodeURIComponent(id) + "/interrupt",
        turn ? { expected_turn_id: turn } : {},
      );
      if (id === state.selected && generation === state.generation)
        await detail(generation);
    }, $("stop"));
  };
  $("latest").onclick = () => {
    $("conversationScroll").scrollTop = $("conversationScroll").scrollHeight;
    updateLatest();
  };
  $("conversationScroll").onscroll = updateLatest;
  $("resumeQueue").onclick = () => run(() => mutateQueue("", "resume"));
  $("changesToggle").onclick = () => {
    $("changesPanel").hidden ? openChanges() : closeChanges();
  };
  $("closeChanges").onclick = closeChanges;
  $("detailsTab").onclick = () => setPanelTab("details");
  $("changesTab").onclick = () => setPanelTab("changes");
  $("filesTab").onclick = () => setPanelTab("files");
  $("logsTab").onclick = () => setPanelTab("logs");
  $("artifactsTab").onclick = () => setPanelTab("artifacts");
  $("inspectorTabs").onkeydown = (event) => {
    const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')],
      index = tabs.indexOf(event.target);
    if (
      index < 0 ||
      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    )
      return;
    event.preventDefault();
    const next =
      tabs[
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
              tabs.length
      ];
    next.click();
    next.focus({ preventScroll: true });
    const bounds = next.getBoundingClientRect(),
      bar = event.currentTarget.getBoundingClientRect();
    if (bounds.left < bar.left)
      event.currentTarget.scrollLeft += bounds.left - bar.left;
    else if (bounds.right > bar.right)
      event.currentTarget.scrollLeft += bounds.right - bar.right;
  };
  $("filesToggle").onclick = () => openPanel("files");
  $("filesSearch").oninput = () => run(loadProjectFiles);
  $("closeFilePreview").onclick = closeFilePreview;
  $("executePlan").onclick = requestPlanExecution;
  $("confirmExecutePlan").onclick = () => run(executePendingPlan);
  $("cancelExecutePlan").onclick = () => {
    if (!state.planExecuting) $("executePlanDialog").close();
  };
  $("executePlanDialog").addEventListener("cancel", (event) => {
    if (state.planExecuting) event.preventDefault();
  });
  $("continuePlanning").onclick = requestPlanRevision;
  $("revisePlanForm").onsubmit = (event) => {
    event.preventDefault();
    run(revisePendingPlan);
  };
  $("cancelRevisePlan").onclick = () => {
    if (!state.sending) $("revisePlanDialog").close();
  };
  $("revisePlanDialog").addEventListener("cancel", (event) => {
    if (state.sending) event.preventDefault();
  });
  $("dismissRequest").onclick = dismissRequest;
  $("requestDialog").addEventListener("cancel", (e) => {
    e.preventDefault();
    dismissRequest();
  });
  $("pendingRequest").onclick = () => openRequest();
  $("pairForm").onsubmit = (e) => {
    e.preventDefault();
    run(async () => {
      await window.RemoteSecure.pair($("pairKey").value.trim());
      $("pairKey").value = "";
      state.optionsLoaded = false;
      await checkDevice();
    });
  };
  $("logout").onclick = () =>
    run(async () => {
      state.generation++;
      state.optionsSeq++;
      state.connectingOwner?.controller?.abort();
      if (state.device?.online !== false) await discardDraft();
      await api("logout", {});
      window.RemoteSecure.clear();
      state.selected = "";
      state.generation++;
      state.sessions = [];
      clearDraft();
      showPair();
    });
  $("retryDevice").onclick = () => run(checkDevice, $("retryDevice"));
  $("closeDeviceDialog").onclick = () => $("deviceDialog").close();
  $("language").onclick = () =>
    showMenu($("language"), [
      { heading: "Language" },
      ...supportedLanguages.map((code) => ({
        label: {
          en: "English",
          zh: "简体中文",
          "zh-TW": "繁體中文",
          ja: "日本語",
          de: "Deutsch",
        }[code],
        selected: getLanguage() === code,
        action: () => {
          setLanguage(code);
          localStorage.setItem("codex.remote.language", code);
          translate();
          if (state.selected) {
            clearView($("history"));
            clearView($("live"));
            state.requestKey = "";
            run(() => detail(state.generation));
          }
        },
      })),
    ]);
  document.addEventListener("click", (e) => {
    if (
      !$("reasoningCard").hidden &&
      !$("reasoningCard").contains(e.target) &&
      !e.composedPath().includes($("menu")) &&
      !["model", "effort"].some((id) => $(id).contains(e.target))
    )
      closeReasoning(false);
    if (
      !$("menu").hidden &&
      !$("menu").contains(e.target) &&
      !$("menu")._trigger?.contains(e.target)
    )
      closeMenu();
    if (!e.target.closest("#composer")) hideSuggestions();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("reasoningCard").hidden) {
      e.preventDefault();
      if (!$("menu").hidden) {
        const trigger = $("menu")._trigger;
        closeMenu();
        trigger?.focus({ preventScroll: true });
      } else closeReasoning();
      return;
    }
    if (e.key === "Escape") {
      const trigger = $("menu")._trigger;
      closeMenu();
      trigger?.focus({ preventScroll: true });
      setNavigation(false);
      if (!$("changesPanel").hidden) closeChanges();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (innerWidth <= 760) setNavigation(true);
      $("search").focus({ preventScroll: true });
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
      e.preventDefault();
      if (!$("workspace").hidden) run(create);
    }
    const menu = e.target.closest('[role="menu"]');
    if (menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const items = [...menu.querySelectorAll("button:not(:disabled)")],
        index = items.indexOf(document.activeElement),
        next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length;
      items[next]?.focus({ preventScroll: true });
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      if (state.device) checkDevice();
      if (state.selected) {
        if (state.catalog.capabilities?.streaming) ensureStream();
        else poll(state.generation);
      }
    }
  });
  window.addEventListener("focus", () => {
    if (state.device) checkDevice();
  });
  window.addEventListener("pagehide", () => {
    closeStream();
    clearTimeout(state.timer);
    clearTimeout(state.deviceTimer);
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && state.device) checkDevice();
    if (event.persisted && state.selected)
      run(async () => {
        await detail(state.generation);
        ensureStream();
      });
  });
  window.addEventListener("resize", () => {
    closeMenu();
    positionReasoning();
    if (innerWidth > 760) setNavigation(false);
    updateLatest();
  });
  translate();
  renderChanges();
  window.addEventListener("hashchange", () => {
    if (new URLSearchParams(location.hash.slice(1)).has("key"))
      location.reload();
  });
}
