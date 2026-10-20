import { renderView, clearView } from "../render";
import { RemoteIcon as Icon } from "../components/RemoteIcon";

export function createSuggestions({
  state,
  $,
  ownerCan,
  t,
  applyPreferences,
  openReasoning,
  permissionMenu,
  api,
  projectName,
  notice,
  Action,
  canConfigure,
  renderAttachments,
  resizeComposer,
  run,
}) {
  function hideSuggestions() {
    state.suggestionSeq++;
    state.suggestions = [];
    state.suggestionToken = null;
    $("suggestions").hidden = true;
    $("message").setAttribute("aria-expanded", "false");
    clearView($("suggestions"));
    $("message").removeAttribute("aria-activedescendant");
  }
  async function suggest() {
    if (!ownerCan("send")) {
      hideSuggestions();
      return;
    }
    const input = $("message"),
      cursor = input.selectionStart,
      before = input.value.slice(0, cursor),
      match = before.match(/(?:^|\s)([@/])([^\s]*)$/);
    if (!match) {
      hideSuggestions();
      return;
    }
    const token = {
      kind: match[1],
      q: match[2],
      start: cursor - match[2].length - 1,
      end: cursor,
    };
    state.suggestionToken = token;
    const seq = ++state.suggestionSeq;
    let entries = [];
    if (token.kind === "/") {
      const q = token.q.toLowerCase();
      entries = [
        {
          kind: "command",
          name: "/plan",
          description: t("Discuss a plan before changing files."),
          action: () => applyPreferences({ mode: "plan" }),
        },
        {
          kind: "command",
          name: "/default",
          description: t("Codex can implement the task."),
          action: () => applyPreferences({ mode: "default" }),
        },
        {
          kind: "command",
          name: "/model",
          description: t("Choose a model and reasoning effort"),
          action: () => openReasoning($("model")),
        },
        {
          kind: "command",
          name: "/permissions",
          description: t("Change computer permissions"),
          action: permissionMenu,
        },
        ...(state.catalog.skills || []).map((s) => ({
          kind: "skill",
          name: s.name,
          description: s.description,
          value: { name: s.name, path: s.path },
        })),
        ...(state.catalog.tools || []).map((tool) => ({
          kind: "tool",
          name: tool.server + "/" + tool.name,
          description: tool.description,
          value: { server: tool.server, name: tool.name },
        })),
      ]
        .filter((e) => (e.name + " " + e.description).toLowerCase().includes(q))
        .slice(0, 30);
    } else {
      if (!state.project) {
        entries = [{ kind: "note", name: t("Choose a project first.") }];
      } else {
        try {
          const result = await api(
            "files?" +
              new URLSearchParams({
                project: state.project,
                ...(state.selected ? { thread: state.selected } : {}),
                q: token.q,
              }),
          );
          entries = (result.files || []).slice(0, 35).map((f) => ({
            kind: "file",
            name: f.relative || f.name,
            description: f.directory ? t("Directory") : f.path,
            value: { path: f.path, name: f.name || projectName(f.path) },
          }));
        } catch (e) {
          if (seq === state.suggestionSeq) notice(e.message);
        }
      }
    }
    if (seq !== state.suggestionSeq) return;
    state.suggestions = entries;
    state.suggestionIndex = 0;
    drawSuggestions();
  }
  function drawSuggestions() {
    const root = $("suggestions");
    renderView(
      root,
      <>
        {!state.suggestions.length && (
          <p className="menu-note">{t("No matching files or tools.")}</p>
        )}
        {state.suggestions.map((entry, index) =>
          entry.kind === "note" ? (
            <p key={index} className="menu-note">
              {entry.name}
            </p>
          ) : (
            <Action
              key={index}
              id={"suggestion-" + index}
              className="suggestion-button"
              role="option"
              aria-selected={index === state.suggestionIndex}
              onMouseDown={(event) => event.preventDefault()}
              action={() => pickSuggestion(index)}
            >
              <Icon
                name={
                  entry.kind === "file"
                    ? "file"
                    : entry.kind === "tool"
                      ? "tool"
                      : "plan"
                }
              />
              <span className="suggestion-copy">
                <strong>{entry.name}</strong>
                {entry.description && <small>{entry.description}</small>}
              </span>
            </Action>
          ),
        )}
      </>,
    );
    root.hidden = false;
    $("message").setAttribute("aria-expanded", "true");
    $("message").setAttribute(
      "aria-activedescendant",
      "suggestion-" + state.suggestionIndex,
    );
  }

  function pickSuggestion(index) {
    if (!ownerCan("send")) return;
    const entry = state.suggestions[index],
      token = state.suggestionToken;
    if (
      !entry ||
      !token ||
      entry.kind === "note" ||
      (entry.action && !canConfigure())
    )
      return;
    const input = $("message");
    input.value =
      input.value.slice(0, token.start) + input.value.slice(token.end);
    input.selectionStart = input.selectionEnd = token.start;
    if (
      entry.kind === "file" &&
      !state.mentions.some((x) => x.path === entry.value.path)
    )
      state.mentions.push(entry.value);
    else if (
      entry.kind === "skill" &&
      !state.skills.some((x) => x.path === entry.value.path)
    )
      state.skills.push(entry.value);
    else if (
      entry.kind === "tool" &&
      !state.tools.some(
        (x) => x.server === entry.value.server && x.name === entry.value.name,
      )
    )
      state.tools.push(entry.value);
    const action = entry.action;
    hideSuggestions();
    renderAttachments();
    resizeComposer();
    input.focus({ preventScroll: true });
    if (action) run(action);
  }

  return { hideSuggestions, suggest, drawSuggestions, pickSuggestion };
}
