import {
  asyncQuestions,
  asyncQuestionReply,
  questionReplies,
} from "./codex-questions";

function displayUserContent(content) {
  const quote = '("(?:[^"\\\\]|\\\\.)*")';
  const patterns = [
    [
      "attachment",
      new RegExp(
        "^User attached file " +
          quote +
          ", available locally at " +
          quote +
          "\\. Read this file using the available tools when relevant\\.$",
      ),
    ],
    [
      "mention",
      new RegExp(
        "^User referenced project file " + quote + " at " + quote + "\\.$",
      ),
    ],
    [
      "tool",
      new RegExp(
        "^The user selected MCP tool " +
          quote +
          " on server " +
          quote +
          " for this request\\. Use it when relevant\\.$",
      ),
    ],
  ];
  return content.map((part) => {
    if (part.type !== "text" || typeof part.text !== "string") return part;
    const replies = questionReplies(part.text);
    if (replies)
      return {
        ...part,
        text: replies
          .map((reply) => reply.question + "\n" + reply.answer)
          .join("\n\n"),
      };
    for (const [type, pattern] of patterns) {
      const match = part.text.match(pattern);
      if (!match) continue;
      try {
        const name = JSON.parse(match[1]),
          other = JSON.parse(match[2]);
        return {
          type,
          name: type === "tool" ? other + " / " + name : name,
          ...(["attachment", "mention"].includes(type) ? { path: other } : {}),
        };
      } catch {
        return part;
      }
    }
    return part;
  });
}

function appConsentOf(params, capabilities) {
  const meta = params._meta,
    offered =
      typeof meta?.persist === "string"
        ? [meta.persist]
        : Array.isArray(meta?.persist)
          ? meta.persist
          : [];
  if (
    !capabilities?.app_approval_persistence ||
    params.mode === "url" ||
    meta?.codex_approval_kind !== "mcp_tool_call" ||
    meta.connector_id !== "computer-use" ||
    typeof meta.tool_params?.app !== "string" ||
    !meta.tool_params.app.trim() ||
    Object.keys(params.requestedSchema?.properties || {}).length
  )
    return null;
  const persist = [
    ...new Set(
      offered.filter((value) => value === "session" || value === "always"),
    ),
  ];
  if (!persist.length) return null;
  const display = Array.isArray(meta.tool_params_display)
    ? meta.tool_params_display.find((field) => field?.name === "app")?.value
    : null;
  return {
    app: typeof display === "string" ? display : meta.tool_params.app,
    persist,
  };
}

function permissionProfiles(catalog) {
  const legacy = [
    {
      id: "read-only",
      name: "Read only",
      description: "Read project files; changes require approval.",
    },
    {
      id: "workspace-write",
      name: "Workspace access",
      description:
        "Edit files in the shared project; ask before broader access.",
    },
    {
      id: "full-access",
      name: "Full access",
      description: "Edit any file and access the network on this computer.",
    },
  ];
  const native = [
    {
      id: "workspace-write",
      name: "Ask for approval",
      description:
        "Always ask before editing external files or using the internet.",
    },
    {
      id: "auto-review",
      name: "Approve for me",
      description: "Only ask for actions detected as potentially unsafe.",
    },
    {
      id: "full-access",
      name: "Full access",
      description:
        "Unrestricted access to the internet and any file on this computer.",
    },
  ];
  return catalog.capabilities?.approval_modes
    ? native.map((profile) => {
        const offered = (catalog.permissions || []).find(
          (value) => value.id === profile.id,
        );
        return {
          ...profile,
          ...offered,
          name: profile.name,
          available: offered?.available === true,
        };
      })
    : legacy;
}

export const codex = {
  id: "codex",
  name: "Codex",
  icon: "codex",
  sourceID: "codex-app",
  desktopURL: (id) => "codex://threads/" + encodeURIComponent(id),
  sourceLabel: (source) =>
    ({
      remote: "Remote",
      "codex-app": "Codex App",
      app: "Codex App",
      desktop: "Codex App",
      vscode: "VS Code",
      cli: "CLI",
    })[source] ||
    source ||
    "Unknown source",
  modelID: (model) => model?.model || model?.id || "",
  modelName: (model) => model?.displayName || model?.model || model?.id || "",
  selectedModel: (catalog, id) =>
    catalog.models?.find((model) => model.model === id || model.id === id),
  defaultModel: (catalog) =>
    catalog.models?.find((model) => model.model === catalog.defaults?.model) ||
    catalog.models?.find((model) => model.isDefault) ||
    null,
  reasoningEfforts: (model) =>
    (model?.supportedReasoningEfforts || []).filter(
      (entry) =>
        typeof entry.reasoningEffort === "string" && entry.reasoningEffort,
    ),
  defaultEffort: (model) => model?.defaultReasoningEffort || "",
  requestKind: (request) =>
    ({
      "item/tool/requestUserInput": "question",
      "agentMessage/questions": "question",
      "mcpServer/elicitation/request": "elicitation",
      "item/permissions/requestApproval": "permissions",
    })[request.method] || "approval",
  isAppConsent: (params) =>
    params._meta?.codex_approval_kind === "mcp_tool_call" &&
    params._meta.connector_id === "computer-use",
  asyncQuestions,
  asyncQuestionReply,
  displayUserContent,
  appConsentOf,
  permissionProfiles,
  modes: (catalog) =>
    catalog.modes?.length
      ? catalog.modes
      : [{ mode: "default" }, { mode: "plan" }],
  emptyModelsMessage: "No models were returned by Codex.",
  permissionLabel: (value, state) => {
    if (!value)
      return !state.selected
        ? "Use Codex App settings"
        : state.nativeSettings()
          ? "Custom permissions"
          : state.catalog.capabilities?.approval_modes
            ? "Ask for approval"
            : "Workspace access";
    return (
      {
        "read-only": "Read only",
        "workspace-write": state.catalog.capabilities?.approval_modes
          ? "Ask for approval"
          : "Workspace access",
        "auto-review": "Approve for me",
        "full-access": "Full access",
      }[value] || "Custom permissions"
    );
  },
  modeDescription: (mode) =>
    mode.mode === "plan"
      ? "Discuss a plan before changing files."
      : "Codex can implement the task.",
  modeLabel: (mode) => (mode.mode === "plan" ? "Plan mode" : "Default mode"),
  effortName: (value, t) =>
    t(
      {
        none: "None",
        minimal: "Minimal",
        low: "Low",
        medium: "Medium",
        high: "High",
        xhigh: "Extra high",
        max: "Maximum",
        ultra: "Ultra",
      }[value] ||
        value ||
        "Default effort",
    ),
};
