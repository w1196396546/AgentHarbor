import { renderView, clearView } from "../render";
import { FieldSet, FieldLegend, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { AskCard } from "../components/ui/ask-card";
import { createReadIndexes } from "./indexes";
import { normalizeInteractions, interactionItems } from "./interaction-history";
import { questionFormAnswers } from "./question-answers";

export function createApprovals({
  $,
  state,
  ownerCan,
  ownerEpoch,
  t,
  requireOwner,
  api,
  detail,
  run,
  safeURL,
  Action,
  textOf,
  getAgent,
  onHistoryChanged,
}) {
  let scope = "",
    selectedKey = "",
    renderedKey = "",
    pendingKeys = new Set();
  const drafts = new Map();
  const history = createReadIndexes({
    state,
    getAgent,
    api,
    onChange: () => onHistoryChanged?.(),
  });
  let historyToken = "";

  function historyPage() {
    return history.read("interaction_history", "interactions", "interactions");
  }
  function getInteractionHistory() {
    return history.supports("interaction_history")
      ? normalizeInteractions(historyPage().items)
      : [];
  }
  function syncInteractionHistory() {
    if (!state.selected || !history.supports("interaction_history")) return;
    const token = JSON.stringify([
        history.currentScope(),
        state.live?.turn_id,
        state.live?.status,
        state.currentRequests.map((request) => [request.id, request.method]),
      ]),
      page = historyPage();
    if (token === historyToken || page.loading) return;
    historyToken = token;
    void history.load("interaction_history", "interactions", "interactions");
  }
  function interactionStatus(status) {
    return t(
      {
        pending: "Pending",
        approved: "Approved",
        declined: "Declined",
        answered: "Answered",
        cancelled: "Cancelled",
        expired: "Expired",
      }[status] || "Status unknown",
    );
  }
  function InteractionHistory({ item }) {
    const sourceItems = item.data?.items || [item],
      interactions = getInteractionHistory().filter(
        (value) =>
          value.status !== "pending" &&
          sourceItems.some(
            (source) =>
              value.item_id === source.id &&
              (!value.turn_id || value.turn_id === source.turn_id),
          ),
      );
    if (!interactions.length) return null;
    return (
      <details className="raw-details interaction-history">
        <summary>
          {t("Interaction history")} ({interactions.length})
        </summary>
        {interactions.map((value) => (
          <section key={value.request_id} className="linked-request">
            <p>
              <strong>{interactionStatus(value.status)}</strong>
              {value.summary && " · " + value.summary}
            </p>
            {value.reason && <p className="tool-text">{value.reason}</p>}
            {value.resolved_at_ms && (
              <p className="note">
                <time dateTime={new Date(value.resolved_at_ms).toISOString()}>
                  {new Date(value.resolved_at_ms).toLocaleString()}
                </time>
              </p>
            )}
          </section>
        ))}
      </details>
    );
  }
  function InteractionHistoryStatus() {
    if (!history.supports("interaction_history")) return null;
    const page = historyPage();
    return (
      <div className="interaction-history-status">
        <p className="note" role="status">
          {t("Interaction history")} ·{" "}
          {t(
            page.loading
              ? "Loading…"
              : !page.loaded || page.error
                ? "Status unknown"
                : page.scope === "full"
                  ? "Full history"
                  : "Loaded records only",
          )}
          {(page.truncated || page.hasMore || page.scope === "loaded") &&
            " · " + t("Results are incomplete")}
        </p>
        {page.error && (
          <p className="note" role="status">
            {t(page.error)}
          </p>
        )}
        {page.error && (
          <Action
            action={() =>
              history.load(
                "interaction_history",
                "interactions",
                "interactions",
              )
            }
          >
            {t("Retry")}
          </Action>
        )}
        {page.hasMore && (
          <Action
            disabled={page.loading}
            action={() =>
              history.load(
                "interaction_history",
                "interactions",
                "interactions",
                undefined,
                true,
              )
            }
          >
            {t("Load more interaction history")}
          </Action>
        )}
      </div>
    );
  }

  function requestScope() {
    return JSON.stringify([
      state.device?.id,
      getAgent().id,
      state.selected,
      ownerEpoch(),
    ]);
  }
  function requestKey(request) {
    return JSON.stringify(
      [scope, request.id, request.method, request.params || {}],
      (_, value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
            )
          : value,
    );
  }
  function operationOf(request) {
    return request.method === "agentMessage/questions" ? "steer" : "answer";
  }
  function captureAnswers() {
    if (!renderedKey || !pendingKeys.has(renderedKey)) return;
    drafts.set(
      renderedKey,
      Array.from(
        $("requests").querySelectorAll("input[name], textarea[name]"),
      ).map((input) => ({
        name: input.name,
        value: input.value,
        checked: input.checked,
      })),
    );
  }
  function AnswerInput(props) {
    const saved = drafts
      .get(selectedKey)
      ?.find(
        (field) =>
          field.name === props.name &&
          (!["checkbox", "radio"].includes(props.type) ||
            field.value === String(props.value ?? "on")),
      );
    return (
      <Input
        {...props}
        {...(saved
          ? ["checkbox", "radio"].includes(props.type)
            ? { defaultChecked: saved.checked }
            : { defaultValue: saved.value }
          : {})}
      />
    );
  }
  function closeDialog() {
    if ($("requestDialog").open) $("requestDialog").close();
    $("pendingRequest").hidden = true;
    clearView($("requests"));
    state.currentRequests = [];
    state.requestKey = "";
    state.dismissedKey = "";
    scope = selectedKey = renderedKey = "";
    pendingKeys.clear();
    drafts.clear();
  }
  function renderRequests(requests) {
    const nextScope = requestScope();
    if (scope !== nextScope) {
      closeDialog();
      scope = nextScope;
    }
    const hadPending = pendingKeys.size > 0;
    captureAnswers();
    pendingKeys = new Set(requests.map(requestKey));
    for (const key of drafts.keys())
      if (!pendingKeys.has(key)) drafts.delete(key);
    state.currentRequests = requests;
    if (!requests.length) {
      closeDialog();
      return;
    }
    const request =
        requests.find(
          (value) =>
            requestKey(value) === selectedKey && ownerCan(operationOf(value)),
        ) ||
        requests.find((value) => ownerCan(operationOf(value))) ||
        requests[0],
      operation = operationOf(request);
    selectedKey = requestKey(request);
    const pending = $("pendingRequest"),
      pendingLabel = pending.querySelector("[data-t]");
    if (pendingLabel)
      pendingLabel.textContent =
        t("Codex is waiting for you") + " (" + requests.length + ")";
    pending.disabled = !requests.some((value) => ownerCan(operationOf(value)));
    if (!ownerCan(operation)) {
      if ($("requestDialog").open) $("requestDialog").close();
      if (renderedKey && !pendingKeys.has(renderedKey)) {
        clearView($("requests"));
        renderedKey = "";
      }
      pending.hidden = false;
      return;
    }
    const key = JSON.stringify([
      selectedKey,
      [...pendingKeys],
      state.generation,
      getAgent().isAppConsent(request.params || {})
        ? !!state.catalog.capabilities?.app_approval_persistence
        : null,
    ]);
    if (key === state.requestKey) {
      pending.hidden = $("requestDialog").open;
      return;
    }
    state.requestKey = key;
    const epoch = ownerEpoch(),
      sessionID = state.selected,
      generation = state.generation,
      p = request.params || {},
      question = getAgent().requestKind(request) === "question",
      elicitation = getAgent().requestKind(request) === "elicitation",
      permissions = getAgent().requestKind(request) === "permissions",
      appConsent = elicitation
        ? getAgent().appConsentOf(p, state.catalog.capabilities)
        : null;
    $("requestTitle").textContent =
      t(
        question
          ? "Codex has a question"
          : appConsent
            ? "Allow app access?"
            : elicitation
              ? "A tool needs your input"
              : "Approval required",
      ) +
      (requests.length > 1
        ? " (" + (requests.indexOf(request) + 1) + "/" + requests.length + ")"
        : "");
    const answerKey = selectedKey;
    const answer = async (value) => {
      requireOwner(operation);
      if (
        epoch !== ownerEpoch() ||
        sessionID !== state.selected ||
        generation !== state.generation
      )
        throw new Error(
          "The original application changed. Review the current request before answering.",
        );
      const asyncQuestion = request.method === "agentMessage/questions";
      if (asyncQuestion && (p.turn_id !== state.turnID || !state.running))
        throw new Error("The running turn changed. Review it before steering.");
      await api(
        "threads/" +
          encodeURIComponent(sessionID) +
          (asyncQuestion ? "/steer" : "/answer"),
        asyncQuestion
          ? {
              text: getAgent().asyncQuestionReply(p.questions, value.answers),
              expected_turn_id: p.turn_id,
            }
          : { id: request.id, ...value },
      );
      drafts.delete(answerKey);
      if (renderedKey === answerKey)
        for (const input of $("requests").querySelectorAll(
          "input[name], textarea[name]",
        )) {
          input.value = "";
          input.checked = false;
        }
      if (
        sessionID === state.selected &&
        generation === state.generation &&
        epoch === ownerEpoch()
      ) {
        state.requestKey = "";
        await detail(generation);
      }
    };
    let content,
      submit = (event) => event.preventDefault();
    if (question) {
      content = (
        <>
          {(p.questions || []).map((q) => (
            <FieldSet key={q.id}>
              <FieldLegend>{q.question}</FieldLegend>
              {q.header && <p className="question-header">{q.header}</p>}
              {(q.options || []).map((option) => (
                <FieldLabel key={option.label} className="option-label">
                  <AnswerInput
                    type={q.multiSelect ? "checkbox" : "radio"}
                    name={q.id}
                    value={option.label}
                  />
                  <span className="option-copy">
                    <strong>{option.label}</strong>
                    {option.description && <small>{option.description}</small>}
                  </span>
                </FieldLabel>
              ))}
              <AnswerInput
                type={q.isSecret ? "password" : "text"}
                name={q.id + "-text"}
                maxLength={16000}
                placeholder={t("Your answer")}
                aria-label={q.question}
              />
            </FieldSet>
          ))}
          <div className="request-actions">
            <Button variant="default" className="primary" type="submit">
              {t("Submit answer")}
            </Button>
          </div>
        </>
      );
      submit = (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        run(async () => {
          await answer({
            answers: questionFormAnswers(p.questions || [], form),
          });
        }, event.nativeEvent.submitter);
      };
    } else if (elicitation) {
      const href = p.mode === "url" ? safeURL(p.url) : null,
        destination = href ? new URL(href) : null;
      content = (
        <>
          {p.message && <p>{p.message}</p>}
          {appConsent ? (
            <>
              <strong className="app-consent-name">{appConsent.app}</strong>
              <p>
                {t(
                  "Full access controls files and commands. App authorization is managed separately.",
                )}
              </p>
              <div className="request-actions">
                <Action action={() => answer({ decision: "decline" })}>
                  {t("Decline")}
                </Action>
                {appConsent.persist.map((persist) => (
                  <Action
                    key={persist}
                    className={persist === "session" ? "primary" : ""}
                    action={() =>
                      answer({
                        decision: "accept",
                        content: {},
                        _meta: { persist },
                      })
                    }
                  >
                    {t(
                      persist === "session"
                        ? "Allow this conversation"
                        : "Always allow this app",
                    )}
                  </Action>
                ))}
              </div>
            </>
          ) : (
            <>
              {p.mode === "url" ? (
                href && (
                  <a href={href} target="_blank" rel="noreferrer noopener">
                    {t("Open tool authorization")}{" "}
                    {destination && (
                      <span>({destination.host || destination.pathname})</span>
                    )}
                  </a>
                )
              ) : (
                <ElicitationFields schema={p.requestedSchema} />
              )}
              <div className="request-actions">
                <Action action={() => answer({ decision: "decline" })}>
                  {t("Decline")}
                </Action>
                <Button variant="default" className="primary" type="submit">
                  {t("Submit answer")}
                </Button>
              </div>
            </>
          )}
        </>
      );
      if (!appConsent)
        submit = (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          run(async () => {
            const content = readElicitationFields(form, p.requestedSchema);
            await answer({ decision: "accept", content });
          }, event.nativeEvent.submitter);
        };
    } else {
      const decisions = p.availableDecisions?.length
        ? [...p.availableDecisions]
        : [
            "decline",
            "accept",
            "acceptForSession",
            ...(!permissions ? ["cancel"] : []),
          ];
      if (!p.availableDecisions?.length && p.proposedExecpolicyAmendment)
        decisions.push({
          acceptWithExecpolicyAmendment: {
            execpolicy_amendment: p.proposedExecpolicyAmendment,
          },
        });
      if (!p.availableDecisions?.length)
        for (const amendment of p.proposedNetworkPolicyAmendments || [])
          decisions.push({
            applyNetworkPolicyAmendment: {
              network_policy_amendment: amendment,
            },
          });
      content = (
        <>
          {p.reason && <p>{p.reason}</p>}
          {p.cwd && <p className="cwd">{p.cwd}</p>}
          <pre>
            {typeof p.command === "string"
              ? p.command
              : permissions
                ? JSON.stringify(p.permissions, null, 2)
                : p.command
                  ? textOf(p.command)
                  : textOf(p.changes || p.permissions || p)}
          </pre>
          <div className="request-actions">
            {decisions.map((decision, index) => {
              const kind =
                  typeof decision === "string"
                    ? decision
                    : Object.keys(decision)[0],
                label =
                  kind === "accept"
                    ? "Approve once"
                    : kind === "acceptForSession"
                      ? "Approve for this session"
                      : kind === "decline"
                        ? "Decline"
                        : kind === "cancel"
                          ? "Cancel"
                          : kind === "acceptWithExecpolicyAmendment"
                            ? "Approve this command rule"
                            : kind === "applyNetworkPolicyAmendment"
                              ? "Approve network rule"
                              : "Approve";
              return (
                <Action
                  key={index}
                  className={kind.startsWith("accept") ? "primary" : ""}
                  action={() =>
                    answer({
                      decision,
                      ...(permissions
                        ? {
                            scope:
                              kind === "acceptForSession" ? "session" : "turn",
                          }
                        : {}),
                      ...(kind === "accept"
                        ? { accept: true }
                        : kind === "decline"
                          ? { accept: false }
                          : {}),
                    })
                  }
                >
                  {t(label)}
                </Action>
              );
            })}
          </div>
        </>
      );
    }
    renderView(
      $("requests"),
      <>
        {requests.length > 1 && (
          <nav className="request-actions" aria-label={t("Pending requests")}>
            {requests.map((value, index) => (
              <Button
                variant="default"
                key={requestKey(value)}
                type="button"
                aria-pressed={value === request}
                disabled={!ownerCan(operationOf(value))}
                onClick={() => openRequest(value)}
              >
                {t("Review request")} {index + 1}
              </Button>
            ))}
          </nav>
        )}
        <form
          key={selectedKey}
          className="request"
          data-slot="ask-card"
          onSubmit={submit}
        >
          <AskCard
            question=""
            eyebrow={t(question ? "Codex has a question" : "Approval required")}
            className="request-card"
          >
            {content}
          </AskCard>
        </form>
      </>,
    );
    renderedKey = selectedKey;
    if (!hadPending && !state.dismissedKey) {
      if (!$("requestDialog").open) $("requestDialog").showModal();
    }
    pending.hidden = $("requestDialog").open;
  }

  function schemaChoices(schema) {
    if (schema.enum)
      return schema.enum.map((value, i) => ({
        value,
        label: schema.enumNames?.[i] || String(value),
      }));
    if (schema.oneOf || schema.anyOf)
      return (schema.oneOf || schema.anyOf).map((item) => ({
        value: item.const,
        label: item.title || String(item.const),
      }));
    return [];
  }
  function ElicitationFields({ schema = {} }) {
    return Object.entries(schema.properties || {}).map(([name, field]) => {
      const required = (schema.required || []).includes(name),
        choices = schemaChoices(
          field.type === "array" ? field.items || {} : field,
        );
      const type =
        field.type === "boolean"
          ? "checkbox"
          : ["integer", "number"].includes(field.type)
            ? "number"
            : { password: "password", email: "email", uri: "url" }[
                field.format
              ] || "text";
      return (
        <FieldSet key={name}>
          <FieldLegend>{field.title || name}</FieldLegend>
          {field.description && <p>{field.description}</p>}
          {choices.length ? (
            choices.map((choice, index) => (
              <FieldLabel key={index} className="option-label">
                <AnswerInput
                  type={field.type === "array" ? "checkbox" : "radio"}
                  name={name}
                  value={String(index)}
                  required={required && field.type !== "array"}
                  defaultChecked={
                    field.type === "array"
                      ? (field.default || []).includes(choice.value)
                      : field.default === choice.value
                  }
                />
                <span>{choice.label}</span>
              </FieldLabel>
            ))
          ) : (
            <AnswerInput
              name={name}
              type={type}
              required={required && field.type !== "boolean"}
              aria-label={field.title || name}
              min={field.minimum}
              max={field.maximum}
              minLength={field.minLength}
              maxLength={field.maxLength}
              pattern={field.pattern}
              step={
                field.type === "integer"
                  ? "1"
                  : field.type === "number"
                    ? "any"
                    : undefined
              }
              defaultChecked={
                field.type === "boolean" ? field.default === true : undefined
              }
              defaultValue={
                field.type !== "boolean" && field.default !== undefined
                  ? String(field.default)
                  : undefined
              }
            />
          )}
        </FieldSet>
      );
    });
  }

  function readElicitationFields(form, schema = {}) {
    const data = new FormData(form),
      content = {};
    for (const [name, field] of Object.entries(schema.properties || {})) {
      const choices = schemaChoices(
          field.type === "array" ? field.items || {} : field,
        ),
        value = data.get(name);
      if (field.type === "array") {
        const selected = data
          .getAll(name)
          .map((index) => choices[Number(index)]?.value)
          .filter((x) => x !== undefined);
        if ((schema.required || []).includes(name) && !selected.length)
          throw new Error("Answer every question.");
        if (
          (field.minItems !== undefined && selected.length < field.minItems) ||
          (field.maxItems !== undefined && selected.length > field.maxItems)
        )
          throw new Error("Check the number of selected options.");
        content[name] = selected;
      } else if (choices.length) {
        if (value !== null) content[name] = choices[Number(value)].value;
      } else if (field.type === "boolean") content[name] = value === "on";
      else if (value !== null && String(value) !== "")
        content[name] = ["integer", "number"].includes(field.type)
          ? Number(value)
          : String(value);
    }
    return content;
  }
  function dismissRequest() {
    captureAnswers();
    state.dismissedKey = state.requestKey;
    if ($("requestDialog").open) $("requestDialog").close();
    $("pendingRequest").hidden = !state.currentRequests.length;
  }

  function openRequest(request) {
    if (scope !== requestScope()) return;
    request = request
      ? state.currentRequests.find(
          (value) => requestKey(value) === requestKey(request),
        )
      : state.currentRequests.find(
          (value) => requestKey(value) === selectedKey,
        ) ||
        state.currentRequests.find((value) => ownerCan(operationOf(value)));
    if (!request || !ownerCan(operationOf(request))) return;
    captureAnswers();
    selectedKey = requestKey(request);
    state.dismissedKey = "";
    renderRequests(state.currentRequests);
    if (!$("requestDialog").open) $("requestDialog").showModal();
    $("pendingRequest").hidden = true;
  }
  return {
    closeDialog,
    renderRequests,
    dismissRequest,
    openRequest,
    getInteractionHistory,
    InteractionHistory,
    InteractionHistoryStatus,
    syncInteractionHistory,
    interactionSearchItems: () => interactionItems(getInteractionHistory()),
  };
}
