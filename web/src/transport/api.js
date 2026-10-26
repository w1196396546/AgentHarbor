export function createAPI({
  state,
  actionCapability,
  requireOwner,
  showPair,
  setDeviceOnline,
  archiveConversation,
  unavailableConversation,
  getAgent,
  checkDevice = () => {},
}) {
  const requests = new Set();
  function cancelAPI() {
    for (const controller of requests) controller.abort();
    requests.clear();
  }
  async function api(path, body, options = {}) {
    const generation = state.generation,
      agentScoped = !["device", "logout", "agents"].includes(path),
      agentID = getAgent().id,
      method = options.method || (body === undefined ? "GET" : "POST"),
      capability = actionCapability(path, method);
    const agent = state.agents?.find((value) => value.id === agentID);
    if (agentScoped && agent?.state && agent.state !== "connected") {
      const error = new Error(
        agent.problem ||
          "The selected Agent is not connected. Connect it in agentTools on your computer.",
      );
      error.status = 503;
      throw error;
    }
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
    if (agentScoped) requests.add(controller);
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
    const multipart = body instanceof FormData;
    let res, raw;
    const init = {
      method,
      headers: {
        "X-Codex-Remote": "1",
        ...(["device", "logout"].includes(path) &&
        window.RemoteSecure.deviceID?.()
          ? { "X-Remote-Device": window.RemoteSecure.deviceID() }
          : {}),
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
      if (agentScoped && agentID !== getAgent().id)
        throw new DOMException("The connected agent changed.", "AbortError");
      if (res.status === 401) {
        showPair();
        throw new Error(
          path === "pair"
            ? "Authorization code is invalid or expired."
            : "Pair this browser first",
        );
      }
      if (res.status === 503 && generation === state.generation) {
        if (path === "device") setDeviceOnline(false);
        else checkDevice();
      }
      if (res.status === 204) return null;
      raw = await res.text();
      if (agentScoped && agentID !== getAgent().id)
        throw new DOMException("The connected agent changed.", "AbortError");
    } finally {
      requests.delete(controller);
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    }
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
        !options.observation &&
        generation === state.generation &&
        res.status === 410 &&
        value.archived === true &&
        id
      )
        archiveConversation(id);
      else if (
        !options.observation &&
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
      throw error;
    }
    if (path === "device") window.RemoteSecure.rememberDevice?.(value);
    return value;
  }

  return { api, cancelAPI };
}
