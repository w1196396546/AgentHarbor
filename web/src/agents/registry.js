import { codex } from "./codex";

const adapters = new Map([[codex.id, codex]]);

export function registerAgentAdapter(adapter) {
  if (!adapter?.id || adapters.has(adapter.id))
    throw new Error("Agent adapters need a unique id.");
  adapters.set(adapter.id, adapter);
}

// An adapter describes UI interpretation; the local client owns execution and access.
export function agentFor(descriptor) {
  const id = descriptor?.id || codex.id;
  const adapter = adapters.get(id);
  if (adapter) return adapter;
  return {
    id,
    name: descriptor?.name || id,
    icon: id === "claude" || id.startsWith("claude-") ? "claude" : "agent",
    sourceID: id,
    desktopURL: () => "",
    sourceLabel: (source) => source || "Unknown source",
    modelID: (model) => model?.id || model?.model || "",
    modelName: (model) =>
      model?.name || model?.display_name || model?.id || model?.model || "",
    defaultModel: (catalog) =>
      catalog.models?.find(
        (model) =>
          model.id === catalog.defaults?.model ||
          model.model === catalog.defaults?.model ||
          model.is_default,
      ) || null,
    selectedModel: (catalog, id) =>
      catalog.models?.find((model) => model.id === id || model.model === id),
    reasoningEfforts: (model) => model?.reasoning_efforts || [],
    defaultEffort: (model) => model?.default_effort || "",
    emptyModelsMessage: "No models are available.",
    permissionLabel: (value) => value || "Default permissions",
    modeLabel: (mode) => mode.name || mode.id || mode.mode || "Mode",
    effortName: (value) => value || "Default effort",
    modeDescription: (mode) => mode.description || "",
    requestKind: (request) => request.kind || "approval",
    isAppConsent: () => false,
    appConsentOf: () => null,
    displayUserContent: (content) => content,
    permissionProfiles: (catalog) => catalog.permissions || [],
    modes: (catalog) => catalog.modes || [],
  };
}
