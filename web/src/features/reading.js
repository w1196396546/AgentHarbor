// Persist bounded view metadata only: no messages, answers, attachments or credentials.
export function createReading({ state, $, getAgent }) {
  const storageKey = "codex.remote.reading.v1";
  let scope = "",
    current = {},
    timer;
  function scopeKey() {
    return state.device?.id && state.selected
      ? JSON.stringify([state.device.id, getAgent().id, state.selected])
      : "";
  }
  function records() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(value)
        ? value
            .filter(
              (entry) =>
                typeof entry?.scope === "string" &&
                entry.data &&
                typeof entry.data === "object",
            )
            .slice(-32)
        : [];
    } catch {
      return [];
    }
  }
  function flags(value) {
    return Object.fromEntries(
      Object.entries(value || {})
        .filter(
          ([key, flag]) => key.length <= 1024 && typeof flag === "boolean",
        )
        .slice(-250),
    );
  }
  function metadata(value) {
    return {
      expanded: flags(value.expanded),
      diffExpanded: flags(value.diffExpanded),
      changesTurn:
        typeof value.changesTurn === "string"
          ? value.changesTurn.slice(0, 256)
          : "",
      changesTree: value.changesTree === true,
      anchor:
        typeof value.anchor === "string" ? value.anchor.slice(0, 1024) : "",
      offset: Number.isFinite(value.offset) ? value.offset : 0,
      latest: value.latest === true,
    };
  }
  function persist() {
    clearTimeout(timer);
    if (!scope) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(
          [
            ...records().filter((entry) => entry.scope !== scope),
            { scope, data: metadata(current) },
          ].slice(-32),
        ),
      );
    } catch {
      /* Storage can be disabled or full; keep the current reading position in memory. */
    }
  }
  function get() {
    const next = scopeKey();
    if (scope !== next) {
      persist();
      scope = next;
      current = metadata(
        records().find((entry) => entry.scope === scope)?.data || {},
      );
      current.restore = true;
      state.lastSyncedAt = null;
    }
    return current;
  }
  function capture() {
    const reading = get(),
      scroll = $("conversationScroll");
    if (!scope || scroll.dataset.readingScope !== scope || reading.restore)
      return;
    reading.latest =
      scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop < 80;
    const top = scroll.getBoundingClientRect().top;
    const node = [...scroll.querySelectorAll("[data-id]")].find(
      (node) => node.getBoundingClientRect().bottom > top + 8,
    );
    reading.anchor = node?.dataset.id || "";
    reading.offset = node ? node.getBoundingClientRect().top - top : 0;
  }
  function save() {
    capture();
    persist();
  }
  function afterRender() {
    const reading = get(),
      expected = scope;
    $("conversationScroll").dataset.readingScope = expected;
    requestAnimationFrame(() => {
      if (!expected || expected !== scopeKey()) return;
      const scroll = $("conversationScroll"),
        node = [...scroll.querySelectorAll("[data-id]")].find(
          (node) => node.dataset.id === reading.anchor,
        );
      if (reading.latest) scroll.scrollTop = scroll.scrollHeight;
      else if (node)
        scroll.scrollTop +=
          node.getBoundingClientRect().top -
          scroll.getBoundingClientRect().top -
          reading.offset;
      else if (reading.anchor && reading.restore) {
        $("readingRestore").hidden = false;
        return;
      } else if (reading.restore) scroll.scrollTop = 0;
      $("readingRestore").hidden = true;
      reading.restore = false;
    });
  }
  function jump(id) {
    const node = [
      ...$("conversationScroll").querySelectorAll("[data-id]"),
    ].find((node) => node.dataset.id === id);
    if (!node) return false;
    for (
      let parent = node;
      parent && parent !== $("conversationScroll");
      parent = parent.parentElement
    )
      if (parent.tagName === "DETAILS") parent.open = true;
    node.scrollIntoView({ block: "center" });
    current.restore = false;
    capture();
    persist();
    return true;
  }
  $("conversationScroll").addEventListener(
    "scroll",
    () => {
      if (current.restore) return;
      capture();
      clearTimeout(timer);
      timer = setTimeout(persist, 250);
    },
    { passive: true },
  );
  function cancelRestore() {
    get().restore = false;
    $("readingRestore").hidden = true;
    capture();
  }
  $("conversationScroll").addEventListener("wheel", cancelRestore, {
    passive: true,
  });
  $("conversationScroll").addEventListener("touchstart", cancelRestore, {
    passive: true,
  });
  $("conversationScroll").addEventListener("pointerdown", (event) => {
    if (event.target === $("conversationScroll")) cancelRestore();
  });
  $("conversationScroll").addEventListener("keydown", (event) => {
    if (
      [
        "PageUp",
        "PageDown",
        "Home",
        "End",
        "ArrowUp",
        "ArrowDown",
        " ",
      ].includes(event.key) &&
      event.target === $("conversationScroll")
    )
      cancelRestore();
  });
  $("latest").addEventListener("click", cancelRestore);
  // Save before the stream's pagehide handler clears any live UI.
  window.addEventListener("pagehide", save);
  function lastSession() {
    const pair = [state.device?.id, getAgent().id];
    for (const record of records().reverse()) {
      try {
        const key = JSON.parse(record.scope);
        if (Array.isArray(key) && key[0] === pair[0] && key[1] === pair[1])
          return key[2];
      } catch {
        /* Ignore old or invalid view metadata. */
      }
    }
    return "";
  }
  return { get, save, capture, afterRender, jump, persist, lastSession };
}
