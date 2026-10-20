export function createAPI({
  state,
  actionCapability,
  requireOwner,
  showPair,
  setDeviceOnline,
  archiveConversation,
  unavailableConversation,
  getAgent,
}) {
  const requests = new Set();
  function cancelAPI() {
    for (const controller of requests) controller.abort();
    requests.clear();
  }
  async function api(path, body, options = {}) {
    const generation = state.generation,
      agentID = getAgent().id,
      method = options.method || (body === undefined ? "GET" : "POST"),
      capability = actionCapability(path, method);
    if (capability) requireOwner(capability);
    const ownerEpoch =
      capability && state.live.owner?.epoch
        ? {
            "X-Remote-Owner-Epoch": state.live.owner.epoch,
            "X-Codex-Owner-Epoch": state.live.owner.epoch,
          }
        : {};
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 45000),
      abort = () => controller.abort();
    requests.add(controller);
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
    const multipart = body instanceof FormData;
    let res;
    const init = {
      method,
      headers: {
        "X-Codex-Remote": "1",
        ...(path === "agents" ? {} : { "X-Remote-Agent": agentID }),
        ...ownerEpoch,
        ...(!multipart && body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body:
        body === undefined
          ? undefined
          : multipart
            ? body
            : JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    };
    try {
      res = await (path === "device" || path === "logout"
        ? fetch("/api/" + path, init)
        : window.RemoteSecure.fetch(path, init));
    } finally {
      requests.delete(controller);
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    }
    if (path !== "agents" && agentID !== getAgent().id)
      throw new DOMException("The connected agent changed.", "AbortError");
    if (res.status === 401) {
      showPair();
      throw new Error(
        path === "pair"
          ? "Authorization code is invalid or expired."
          : "Pair this browser first",
      );
    }
    if (res.status === 503 && path !== "threads") {
      setDeviceOnline(false);
      throw new Error("Your computer is offline");
    }
    if (res.status === 204) return null;
    const raw = await res.text();
    if (path !== "agents" && agentID !== getAgent().id)
      throw new DOMException("The connected agent changed.", "AbortError");
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      const error = new Error(raw.trim().slice(0, 300) || "Connection failed.");
      error.status = res.status;
      throw error;
    }
    if (!res.ok) {
      const error = new Error(value.error || "Connection failed."),
        match = path.match(/^(?:sessions|threads)\/([^/?]+)/),
        id = match
          ? decodeURIComponent(match[1])
          : new URLSearchParams(path.split("?")[1]).get("thread");
      error.status = res.status;
      if (
        generation === state.generation &&
        res.status === 410 &&
        value.archived === true &&
        id
      )
        archiveConversation(id);
      else if (
        generation === state.generation &&
        value.history_unavailable === true &&
        id &&
        id === state.selected
      )
        unavailableConversation(value.error);
      if (
        path === "threads" &&
        typeof value.created_thread_id === "string" &&
        /^[A-Za-z0-9_-]{1,128}$/.test(value.created_thread_id)
      )
        error.createdThreadID = value.created_thread_id;
      if (res.status === 503) {
        setDeviceOnline(false);
        if (!error.createdThreadID) error.message = "Your computer is offline";
      }
      throw error;
    }
    return value;
  }

  return { api, cancelAPI };
}
