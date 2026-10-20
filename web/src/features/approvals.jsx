import { renderView, clearView } from "../render";
import { FieldSet, FieldLegend, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { AskCard } from "../components/ui/ask-card";

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
}) {
  function closeDialog() {
    if ($("requestDialog").open) $("requestDialog").close();
    $("pendingRequest").hidden = true;
    clearView($("requests"));
    state.currentRequests = [];
  }
  function renderRequests(requests) {
    if (!ownerCan("answer")) {
      if ($("requestDialog").open) $("requestDialog").close();
      $("pendingRequest").hidden = true;
      return;
    }
    const key = JSON.stringify([
      requests[0] || null,
      ownerEpoch(),
      getAgent().isAppConsent(requests[0]?.params || {})
        ? !!state.catalog.capabilities?.app_approval_persistence
        : null,
    ]);
    if (key === state.requestKey) {
      if (requests.length && !$("requestDialog").open)
        $("pendingRequest").hidden = false;
      return;
    }
    state.requestKey = key;
    clearView($("requests"));
    if (!requests.length) {
      closeDialog();
      state.dismissedKey = "";
      return;
    }
    state.currentRequests = requests;
    const request = requests[0],
      epoch = ownerEpoch(),
      p = request.params || {},
      question = getAgent().requestKind(request) === "question",
      elicitation = getAgent().requestKind(request) === "elicitation",
      permissions = getAgent().requestKind(request) === "permissions",
      appConsent = elicitation
        ? getAgent().appConsentOf(p, state.catalog.capabilities)
        : null;
    $("requestTitle").textContent = t(
      question
        ? "Codex has a question"
        : appConsent
          ? "Allow app access?"
          : elicitation
            ? "A tool needs your input"
            : "Approval required",
    );
    const answer = async (value) => {
      requireOwner("answer");
      if (epoch !== ownerEpoch())
        throw new Error(
          "The original application changed. Review the current request before answering.",
        );
      await api("threads/" + encodeURIComponent(state.selected) + "/answer", {
        id: request.id,
        ...value,
      });
      state.requestKey = "";
      await detail(state.generation);
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
                  <Input type="radio" name={q.id} value={option.label} />
                  <span className="option-copy">
                    <strong>{option.label}</strong>
                    {option.description && <small>{option.description}</small>}
                  </span>
                </FieldLabel>
              ))}
              <Input
                type={q.isSecret ? "password" : "text"}
                name={q.id + "-text"}
                maxLength={16000}
                placeholder={t("Your answer")}
                aria-label={q.question}
              />
            </FieldSet>
          ))}
          <div className="request-actions">
            <Button variant="glass" className="primary" type="submit">
              {t("Submit answer")}
            </Button>
          </div>
        </>
      );
      submit = (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        run(async () => {
          const answers = {};
          for (const q of p.questions || []) {
            const value = String(
              form.get(q.id + "-text") || form.get(q.id) || "",
            ).trim();
            if (!value) throw new Error("Answer every question.");
            answers[q.id] = value;
          }
          await answer({ answers });
        }, event.nativeEvent.submitter);
      };
    } else if (elicitation) {
      const href = p.mode === "url" ? safeURL(p.url) : null;
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
                    {t("Open tool authorization")}
                  </a>
                )
              ) : (
                <ElicitationFields schema={p.requestedSchema} />
              )}
              <div className="request-actions">
                <Action action={() => answer({ decision: "decline" })}>
                  {t("Decline")}
                </Action>
                <Button variant="glass" className="primary" type="submit">
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
      <form
        key={key}
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
      </form>,
    );
    if (state.dismissedKey !== key) {
      if (!$("requestDialog").open) $("requestDialog").showModal();
      $("pendingRequest").hidden = true;
    } else $("pendingRequest").hidden = false;
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
                <Input
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
            <Input
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
    state.dismissedKey = state.requestKey;
    if ($("requestDialog").open) $("requestDialog").close();
    $("pendingRequest").hidden = !state.currentRequests.length;
  }

  return { closeDialog, renderRequests, dismissRequest };
}
