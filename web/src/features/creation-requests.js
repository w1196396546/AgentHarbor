const prefix = "remote.creation.v1:";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const identity = /^[A-Za-z0-9_-]{1,128}$/;
const unavailable = () =>
  new Error(
    "Unable to preserve the creation request. Review your computer before creating another conversation.",
  );

export function createCreationRequests(storage) {
  function key(scope) {
    if (
      scope.length !== 3 ||
      scope.some(
        (value) => typeof value !== "string" || !value || value.length > 4096,
      )
    )
      throw unavailable();
    return prefix + JSON.stringify(scope);
  }
  function read(scope) {
    try {
      const raw = storage.getItem(key(scope));
      if (raw === null) return null;
      if (raw.length > 16384) throw unavailable();
      const record = JSON.parse(raw);
      if (
        !record ||
        typeof record.request_id !== "string" ||
        !uuid.test(record.request_id) ||
        typeof record.options !== "string" ||
        (record.id !== undefined &&
          (typeof record.id !== "string" || !identity.test(record.id)))
      )
        throw unavailable();
      return record;
    } catch {
      throw unavailable();
    }
  }
  function write(scope, record) {
    try {
      const name = key(scope),
        raw = JSON.stringify(record);
      if (
        raw.length > 16384 ||
        (storage.getItem(name) === null &&
          Array.from({ length: storage.length }, (_, i) =>
            storage.key(i),
          ).filter((k) => k?.startsWith(prefix)).length >= 100)
      )
        throw unavailable();
      storage.setItem(name, raw);
    } catch {
      throw unavailable();
    }
  }
  return {
    reserve(scope, options) {
      const fingerprint = JSON.stringify(
          Object.fromEntries(
            Object.entries(options).sort(([a], [b]) => a.localeCompare(b)),
          ),
        ),
        previous = read(scope);
      if (previous) {
        if (!previous.id && previous.options !== fingerprint)
          throw new Error(
            "The previous creation is unconfirmed. Restore its settings and retry, or review the conversation on your computer.",
          );
        return previous;
      }
      const record = { request_id: crypto.randomUUID(), options: fingerprint };
      write(scope, record);
      return record;
    },
    confirm(scope, requestID, id) {
      const record = read(scope);
      if (
        !record ||
        record.request_id !== requestID ||
        typeof id !== "string" ||
        !identity.test(id)
      )
        throw unavailable();
      write(scope, { ...record, id });
    },
    complete(scope, requestID) {
      const record = read(scope);
      if (!record || record.request_id !== requestID) throw unavailable();
      try {
        storage.removeItem(key(scope));
      } catch {
        throw unavailable();
      }
    },
  };
}
