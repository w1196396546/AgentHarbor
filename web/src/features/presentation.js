export function externalURL(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function commandSummary(data, t) {
  return (Array.isArray(data.commandActions) ? data.commandActions : [])
    .map((action) => {
      const label = {
        read: "Read file",
        search: "Search content",
        listFiles: "List files",
      }[action.type];
      return label
        ? [t(label), action.path || action.query || action.name]
            .filter(Boolean)
            .join(" · ")
        : action.command || "";
    })
    .filter(Boolean)
    .join(" · ");
}
export function searchAction(data) {
  const action = data.action || {};
  return {
    label:
      {
        openPage: "Open webpage",
        findInPage: "Find in page",
        search: "Web search",
      }[action.type] || "Web search",
    query: action.pattern || action.query || data.query || "",
    queries: Array.isArray(action.queries)
      ? action.queries.filter((value) => typeof value === "string")
      : [],
    url: externalURL(action.url),
  };
}
export function numberedDiff(text, kind) {
  const raw = !/^diff --git |^@@ |^--- [^\n]*\n\+\+\+ /m.test(text);
  let old = raw && kind === "delete" ? 1 : null,
    next = raw && kind === "add" ? 1 : null,
    remainingOld = Infinity,
    remainingNext = Infinity;
  return text.split("\n").map((text) => {
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(text);
    if (hunk) {
      old = +hunk[1];
      next = +hunk[3];
      remainingOld = +(hunk[2] ?? 1);
      remainingNext = +(hunk[4] ?? 1);
      return { text, kind: "hunk" };
    }
    if (
      (old === null && next === null) ||
      (remainingOld <= 0 && remainingNext <= 0) ||
      text.startsWith("\\") ||
      !/^[ +\-]/.test(text)
    )
      return { text };
    const row = {
      text,
      old: text[0] !== "+" ? old : null,
      next: text[0] !== "-" ? next : null,
      kind: text[0] === "+" ? "add" : text[0] === "-" ? "delete" : "",
    };
    if (row.old !== null) {
      old++;
      remainingOld--;
    }
    if (row.next !== null) {
      next++;
      remainingNext--;
    }
    return row;
  });
}

export function normalizeFilePath(path, cwd = "") {
  let value = String(path || "").replaceAll("\\", "/");
  const root = String(cwd || "")
    .replaceAll("\\", "/")
    .replace(/\/$/, "");
  const windows = /^[A-Za-z]:\//.test(root);
  if (
    root &&
    (windows ? value.toLowerCase() : value).startsWith(
      (windows ? root.toLowerCase() : root) + "/",
    )
  )
    value = value.slice(root.length + 1);
  return value.replace(/^(\.\/)+/, "");
}

// Git quotes non-ASCII path bytes and control characters in unified patches.
export function gitPath(value) {
  if (typeof value !== "string" || !value.startsWith('"')) return value;
  if (!value.endsWith('"')) return "";
  const bytes = [],
    encoder = new TextEncoder(),
    text = value.slice(1, -1);
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== "\\") {
      const point = String.fromCodePoint(text.codePointAt(index));
      bytes.push(...encoder.encode(point));
      index += point.length - 1;
      continue;
    }
    const octal = /^[0-7]{1,3}/.exec(text.slice(index + 1));
    if (octal) {
      bytes.push(parseInt(octal[0], 8));
      index += octal[0].length;
    } else {
      const escaped = {
        a: 7,
        b: 8,
        t: 9,
        n: 10,
        v: 11,
        f: 12,
        r: 13,
        '"': 34,
        "\\": 92,
      }[text[++index]];
      if (escaped === undefined) return "";
      bytes.push(escaped);
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      new Uint8Array(bytes),
    );
  } catch {
    return "";
  }
}

// Both the turn summaries and change panel use this same inventory.
export function collectChanges(state) {
  const cwd = state.cwd || state.project || "",
    normalize = (path) => normalizeFilePath(path, cwd),
    windows = /^[A-Za-z]:[\\/]/.test(cwd),
    files = new Map(),
    liveIDs = new Set((state.live.items || []).map((item) => item.id)),
    items = new Map(
      [...state.history, ...(state.live.items || [])].map((item) => [
        item.id,
        item,
      ]),
    );
  function put(change) {
    const move = typeof change.kind === "object" && change.kind?.move_path,
      path = normalize(move || change.path);
    if (!path) return;
    const key =
        (change.turn_id || "unknown") +
        "|" +
        (windows ? path.toLowerCase() : path),
      previous = files.get(key);
    files.set(key, {
      ...previous,
      ...change,
      path,
      old_path: move
        ? normalize(change.path)
        : change.old_path
          ? normalize(change.old_path)
          : previous?.old_path,
      // Native item links and rename metadata survive workspace snapshots.
      item_id: change.item_id || previous?.item_id,
      key,
    });
  }
  for (const item of items.values())
    if (item.type === "fileChange")
      for (const change of item.data?.changes || [])
        put({
          ...change,
          item_id: item.id,
          turn_id:
            item.turn_id ||
            (liveIDs.has(item.id) ? state.live.turn_id : "") ||
            "",
          truncated: item.cut || change.truncated,
        });
  if (state.live.diff)
    for (const diff of state.live.diff
      .split(/(?=^diff --git )/m)
      .filter(Boolean)) {
      const header =
          /^diff --git ("(?:\\.|[^"])*"|a\/.*?) ("(?:\\.|[^"])*"|b\/.*)$/m.exec(
            diff,
          ),
        renamedFrom = gitPath(diff.match(/^rename from (.+)$/m)?.[1]),
        renamedTo = gitPath(diff.match(/^rename to (.+)$/m)?.[1]),
        added = gitPath(diff.match(/^\+\+\+ (.+)$/m)?.[1]),
        original = gitPath(diff.match(/^--- (.+)$/m)?.[1] || header?.[1]),
        path =
          renamedTo ||
          (added && added !== "/dev/null"
            ? added.replace(/^b\//, "")
            : original?.replace(/^a\//, ""));
      if (path)
        put({
          path,
          old_path: renamedFrom,
          diff,
          turn_id: state.live.turn_id || "",
          truncated: !!state.live.diff_cut,
          binary: /^Binary files |^GIT binary patch$/m.test(diff),
          kind: /^\+\+\+ \/dev\/null$/m.test(diff)
            ? "delete"
            : /^--- \/dev\/null$/m.test(diff)
              ? "add"
              : "update",
        });
    }
  const renamed = [...files.values()].filter(
    (file) => file.old_path && file.old_path !== file.path,
  );
  for (const change of state.workspaceChanges || []) {
    if (
      renamed.some(
        (file) =>
          file.turn_id === change.turn_id &&
          normalize(change.path) === file.old_path &&
          change.kind === "delete",
      )
    )
      continue;
    put({ ...change, turn_id: change.turn_id || "" });
  }
  return [...files.values()];
}

export function toolStatus(item) {
  const data = item.data || {};
  if (
    data.success === false ||
    data.result?.isError === true ||
    data.error ||
    (typeof data.exitCode === "number" && data.exitCode !== 0)
  )
    return "failed";
  const status =
    item.status ||
    data.status ||
    (data.success === true ? "completed" : "unknown");
  return (
    {
      success: "completed",
      succeeded: "completed",
      errored: "failed",
      error: "failed",
    }[status] || status
  );
}

export function errorDetails(live) {
  const payload = live.error_data || {},
    error = payload.error || payload;
  return {
    message: live.error || error.message || "",
    details: error.additionalDetails || "",
    code: error.codexErrorInfo || "",
    retrying:
      typeof live.retrying === "boolean" ? live.retrying : payload.willRetry,
    itemID: payload.itemId || payload.targetItemId || "",
    turnID: payload.turnId || live.turn_id || "",
  };
}

export function itemResources(item) {
  const resources = [],
    data = item.data || {};
  function markdownFiles(value) {
    if (typeof value !== "string") return;
    const prose = value
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`\n]*`/g, "");
    for (const match of prose.matchAll(
      /(!?)\[([^\]\n]+)\]\((<[^>\n]+>|[^)\n]+)\)/g,
    )) {
      const target = localFileTarget(match[3]),
        url = externalURL(match[3]);
      if (target || (match[1] && url))
        visit({
          type: match[1] ? "image" : "file",
          name: match[2],
          ...(target ? { path: target.path } : { url }),
        });
    }
  }
  function visit(value) {
    if (typeof value === "string") {
      markdownFiles(value);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (
      [
        "image",
        "localImage",
        "inputImage",
        "resource_link",
        "resourceLink",
        "file",
        "attachment",
      ].includes(value.type) ||
      value.uri
    ) {
      resources.push({
        part: value,
        cut: !!item.cut,
        item_id: item.id,
        turn_id: item.turn_id || "",
        key: item.id + "|" + resources.length,
      });
      return;
    }
    if (typeof value.text === "string") markdownFiles(value.text);
    if (value.resource) visit(value.resource);
    if (value.content) visit(value.content);
    if (value.contentItems) visit(value.contentItems);
  }
  if (["imageGeneration", "imageView", "fileArtifact"].includes(item.type)) {
    const source =
      data.src ||
      data.url ||
      (item.type === "imageGeneration" &&
      typeof data.result === "string" &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(data.result)
        ? "data:image/png;base64," + data.result
        : data.result);
    visit({
      ...data,
      type: item.type === "fileArtifact" ? "file" : "image",
      path: data.path || data.savedPath,
      url: source,
    });
  } else if (["mcpToolCall", "dynamicToolCall"].includes(item.type))
    visit(data.contentItems || data.result);
  else if (item.type === "agentMessage") markdownFiles(item.text || data.text);
  return resources;
}

export function loadedItems(state) {
  return [
    ...new Map(
      [...state.history, ...(state.live.items || [])].map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ];
}

export function searchItems(items, query, filter = "all") {
  const term = query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (
      filter === "failed" &&
      toolStatus(item) !== "failed" &&
      item.type !== "error"
    )
      return false;
    if (filter === "interactions" && item.type !== "interactionHistory")
      return false;
    if (filter === "changes" && item.type !== "fileChange") return false;
    if (filter === "artifacts" && !itemResources(item).length) return false;
    if (!term) return true;
    const data = item.data || {};
    // Search loaded prose and tool output; exclude base64 payloads and raw protocol JSON.
    function text(value) {
      if (typeof value === "string")
        return value.startsWith("data:") ? "" : value;
      if (Array.isArray(value)) return value.map(text).join("\n");
      if (!value || typeof value !== "object") return "";
      return [value.text, value.message, value.content, value.contentItems]
        .map(text)
        .join("\n");
    }
    return [
      item.text,
      data.text,
      data.command,
      data.aggregatedOutput,
      data.progress,
      text(data.content),
      text(data.result),
      text(data.contentItems),
      ...(data.changes || []).map(
        (change) => change.path + "\n" + (change.diff || ""),
      ),
    ]
      .filter((value) => typeof value === "string")
      .join("\n")
      .toLocaleLowerCase()
      .includes(term);
  });
}

export function localFileTarget(value) {
  let path = value.trim().replace(/^<|>$/g, "");
  if (
    !path ||
    path.startsWith("#") ||
    (/^[a-z][a-z0-9+.-]*:/i.test(path) && !/^\w:[\\/]/.test(path))
  )
    return null;
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (path.startsWith("//")) return null;
  const lineMatch = path.match(
      /(?::(\d+)(?::\d+)?|#L(\d+)(?:C\d+)?(?:-L\d+)?)$/,
    ),
    line = Number(lineMatch?.[1] || lineMatch?.[2] || 0);
  if (lineMatch) path = path.slice(0, lineMatch.index);
  if (
    !/^(?:\/|\.\.?\/)/.test(path) &&
    !path.includes("/") &&
    !/\.[^./\s]+$/.test(path)
  )
    return null;
  return { path, line };
}

export function resourcePath(part) {
  if (typeof part.path === "string" && part.path) return part.path;
  if (typeof part.savedPath === "string" && part.savedPath)
    return part.savedPath;
  const source = part.uri || part.url || part.imageUrl;
  if (typeof source !== "string") return "";
  if (/^(?:\/|\.\.?\/|[A-Za-z]:[\\/])/.test(source) && !source.startsWith("//"))
    return source;
  try {
    const url = new URL(source);
    if (
      url.protocol !== "file:" ||
      (url.hostname && url.hostname !== "localhost")
    )
      return "";
    return decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:\/)/, "$1");
  } catch {
    return "";
  }
}
