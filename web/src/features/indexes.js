// Optional read indexes share the encrypted API and never participate in controls.
export function indexSupported(catalog, name) {
  return (
    catalog?.capabilities?.[name] === true &&
    catalog?.protocol_versions?.[name] === 1
  );
}

export function createReadIndexes({
  state,
  getAgent,
  api,
  onChange = () => {},
}) {
  let scope = "";
  const pages = new Map();
  function currentScope() {
    return JSON.stringify([
      state.device?.id,
      getAgent().id,
      state.selected,
      state.generation,
      state.project,
      state.cwd,
      state.live?.owner?.epoch,
    ]);
  }
  function reset() {
    pages.clear();
    scope = currentScope();
  }
  function supports(name) {
    return indexSupported(state.catalog, name);
  }
  function read(name, endpoint, field, body) {
    if (scope !== currentScope()) reset();
    const key = JSON.stringify([name, endpoint, field, body]);
    if (!pages.has(key)) {
      if (pages.size >= 16) pages.delete(pages.keys().next().value);
      pages.set(key, {
        items: [],
        loaded: false,
        loading: false,
        error: "",
        scope: "",
        truncated: false,
        hasMore: false,
        cursor: "",
        seen: new Set(),
      });
    }
    return pages.get(key);
  }
  async function load(name, endpoint, field, body, more = false) {
    if (!state.selected || !supports(name)) return;
    const page = read(name, endpoint, field, body);
    if (page.loading || (more && !page.hasMore)) return;
    const requestScope = scope,
      cursor = more ? page.cursor : "";
    page.loading = true;
    page.error = "";
    onChange();
    try {
      const path =
        "threads/" + encodeURIComponent(state.selected) + "/" + endpoint;
      const value = await api(
        body === undefined
          ? path + (cursor ? "?" + new URLSearchParams({ cursor }) : "")
          : path,
        body === undefined ? undefined : { ...body, cursor },
        { observation: true },
      );
      if (requestScope !== currentScope()) return;
      if (
        value?.version !== 1 ||
        !Array.isArray(value[field]) ||
        !["loaded", "full"].includes(value.scope) ||
        typeof value.has_more !== "boolean"
      )
        throw new Error("Read index response is unavailable or unsupported.");
      if (
        value[field].length > (name === "agent_run_graph" ? 1000 : 200) ||
        (value.next_cursor &&
          (typeof value.next_cursor !== "string" ||
            value.next_cursor.length > 24 * 1024))
      )
        throw new Error("Read index response exceeds its limits.");
      const previous = more ? page.items : [],
        values = new Map(
          previous.map((item) => [item.id || item.request_id, item]),
        );
      for (const item of value[field]) {
        const id = item?.id || item?.request_id;
        if (typeof id !== "string" || !id || id.length > 24 * 1024)
          throw new Error("Read index response is unavailable or unsupported.");
        values.set(id, item);
      }
      if (!more) page.seen.clear();
      if (cursor) page.seen.add(cursor);
      const next = value.next_cursor || "";
      const repeated = value.has_more && (!next || page.seen.has(next));
      page.items = [...values.values()].slice(0, 2000);
      page.loaded = true;
      page.scope = more && page.scope === "loaded" ? "loaded" : value.scope;
      page.truncated =
        (more && page.truncated) ||
        !!value.truncated ||
        !!value.read_error ||
        repeated ||
        values.size > 2000 ||
        (values.size >= 2000 && value.has_more);
      page.cursor = next;
      page.hasMore = value.has_more && !repeated && values.size < 2000;
      if (repeated)
        page.error =
          "Pagination stopped because the history cursor did not advance.";
      else if (value.read_error)
        page.error = "Some history could not be read. Results are incomplete.";
    } catch (error) {
      if (requestScope === currentScope())
        page.error = error.message || "Unable to read history index.";
    } finally {
      page.loading = false;
      if (requestScope === currentScope()) onChange();
    }
  }
  return { read, load, supports, reset, currentScope };
}
