import {
  commandSummary,
  searchAction,
  externalURL,
  toolStatus,
  modelErrorGroups,
  resourcePath,
  groupByTurn,
} from "./presentation";
import { renderView } from "../render";
import { useEffect, useRef, useState } from "react";
import { StepDisclosure } from "../components/ui/tool-steps";
import { RemoteIcon as Icon } from "../components/RemoteIcon";
import { Message, MessageContent } from "../components/ui/message";
import { Bubble, BubbleContent } from "../components/ui/bubble";
import { Reasoning } from "../components/ui/reasoning";
import { Attachment, AttachmentMedia } from "../components/ui/attachment";
import { Tag } from "../components/ui/tag";

export function createConversation({
  t,
  markdown,
  Action,
  openChanges,
  projectName,
  getAgent,
  getScope = () => "",
  getLive = () => ({}),
  getAllItems = () => [],
  getChangedFiles,
  isPartialHistory = () => false,
  getReadingState = () => ({}),
  onReadingChange = () => {},
  jumpToItem,
  openTurnChanges,
  turnLabel,
  getRequests = () => [],
  openRequest,
  renderInteractionHistory,
  openProjectFile,
  openAttachment,
  getSubagents = () => [],
  openSubagent,
  readOnly = false,
}) {
  function mergeOrdered(existing, incoming, prepend = false, beforeID = "") {
    if (!incoming.length) return existing;
    const values = new Map(existing.map((item) => [item.id, item]));
    if (incoming.every((item) => values.has(item.id))) {
      for (const item of incoming) values.set(item.id, item);
      return existing.map((item) => values.get(item.id));
    }
    const order = existing.map((item) => item.id);
    let cursor =
      beforeID && order.includes(beforeID)
        ? order.indexOf(beforeID)
        : prepend
          ? 0
          : order.length;
    for (let i = 0; i < incoming.length; i++) {
      const item = incoming[i],
        index = order.indexOf(item.id);
      values.set(item.id, item);
      if (index >= 0) {
        cursor = index + 1;
        continue;
      }
      const next = incoming.slice(i + 1).find((other) => values.has(other.id));
      if (next) cursor = order.indexOf(next.id);
      order.splice(cursor, 0, item.id);
      cursor++;
    }
    return order.map((id) => values.get(id));
  }
  function legacyItems(parts) {
    return parts.map((p, i) => ({
      id: "part-" + i,
      type:
        p.role === "user"
          ? "userMessage"
          : p.kind === "thinking"
            ? "reasoning"
            : p.role === "assistant"
              ? "agentMessage"
              : "legacyTool",
      text: p.text,
      data: { name: p.name },
    }));
  }
  // shortcut: group adjacent calls within a turn until the client provides native batch IDs.
  const toolCallTypes = new Set([
    "commandExecution",
    "mcpToolCall",
    "dynamicToolCall",
    "webSearch",
    "collabAgentToolCall",
    "collabToolCall",
    "legacyTool",
  ]);
  let scope = "";
  const expanded = new Map(),
    requestSeen = new Map();
  function expandedState() {
    const reading = getReadingState();
    return (reading.expanded ||= {});
  }
  function rememberExpanded(id, value, activityScope) {
    if (activityScope !== getScope()) return;
    expanded.set(id, value);
    expandedState()["item:" + id] = value;
    onReadingChange();
  }
  function renderItems(
    root,
    items,
    continuingTurns = new Set(),
    view,
    errorsGrouped = false,
  ) {
    if (scope !== getScope()) {
      scope = getScope();
      expanded.clear();
      requestSeen.clear();
    }
    const itemsByTurn =
        view?.itemsByTurn ||
        groupByTurn([
          ...new Map(
            [...items, ...getAllItems()].map((item) => [item.id, item]),
          ).values(),
        ]),
      changesByTurn =
        view?.changesByTurn ||
        (getChangedFiles && groupByTurn(getChangedFiles()));
    const grouped = [];
    for (const item of errorsGrouped
      ? items
      : modelErrorGroups(items, root.id === "live" ? getLive() : {})) {
      if (
        /^(hook|systemEvent|tokenCount)$/.test(item.type) ||
        item.data?.name === "hook"
      ) {
        const previous = grouped.at(-1);
        if (
          previous?.type === "backgroundActivity" &&
          previous.turn_id === item.turn_id
        )
          previous.data.items.push(item);
        else
          grouped.push({
            id: "background-" + item.id,
            type: "backgroundActivity",
            turn_id: item.turn_id,
            data: { items: [item] },
          });
        continue;
      }
      if (toolCallTypes.has(item.type)) {
        const previous = grouped.at(-1),
          last =
            previous?.type === "toolBatch"
              ? previous.data.items.at(-1)
              : previous;
        if (
          last &&
          toolCallTypes.has(last.type) &&
          last.turn_id &&
          item.turn_id === last.turn_id
        ) {
          if (previous.type === "toolBatch") previous.data.items.push(item);
          else
            grouped.splice(-1, 1, {
              id: "tool-batch-" + last.id,
              type: "toolBatch",
              data: { items: [last, item] },
            });
        } else grouped.push(item);
        continue;
      }
      grouped.push(item);
    }
    renderView(root, [
      ...grouped.flatMap((item, index) => {
        const turnID = (item.data?.items || [item])[0]?.turn_id;
        const nodes = [<Item key={scope + "|" + item.id} item={item} />];
        const next = grouped[index + 1],
          nextTurn = (next?.data?.items || [next])[0]?.turn_id;
        if (turnID && turnID !== nextTurn && !continuingTurns.has(turnID))
          nodes.push(
            <TurnSummary
              key={scope + "|turn-" + turnID}
              id={turnID}
              items={itemsByTurn.get(turnID) || []}
              changes={changesByTurn?.get(turnID) || (changesByTurn && [])}
            />,
          );
        return nodes;
      }),
    ]);
  }
  function Activity({
    item,
    title,
    subtitle,
    symbol,
    status = "",
    kind = "",
    open = false,
    children,
    className = "",
  }) {
    const requests = requestsFor(item),
      requestIDs = requests.map((request) => JSON.stringify(request.id)),
      signature = JSON.stringify(requestIDs),
      disclosure = useRef(null),
      activityScope = useRef(scope),
      seen = useRef(requestSeen.get(item.id) || requestIDs),
      initial = useRef(
        requestIDs.some((id) => !seen.current.includes(id)) ||
          (expanded.get(item.id) ??
            expandedState()["item:" + item.id] ??
            (requests.length > 0 || open)),
      );
    useEffect(() => {
      if (activityScope.current !== getScope()) return;
      if (requestIDs.some((id) => !seen.current.includes(id))) {
        if (disclosure.current) disclosure.current.open = true;
        rememberExpanded(item.id, true, activityScope.current);
      }
      seen.current = requestIDs;
      requestSeen.set(item.id, requestIDs);
    }, [signature]);
    return (
      <StepDisclosure
        ref={disclosure}
        data-id={item.id}
        data-type={item.type}
        className={"activity " + kind + " " + className}
        open={initial.current}
        onToggle={(event) =>
          rememberExpanded(
            item.id,
            event.currentTarget.open,
            activityScope.current,
          )
        }
      >
        <summary>
          <Icon name={symbol} />
          <span className="activity-title">{t(title)}</span>
          <span className="activity-subtitle">{subtitle || ""}</span>
          <span
            className="activity-meta"
            data-status={requests.length ? "waiting" : status}
          >
            {requests.length
              ? requestLabel(requests) + " · " + requests.length
              : statusLabel(status)}
          </span>
          <Icon name="chevron" className="fold-icon" />
        </summary>
        <div className="activity-body">
          <Pending item={item} />
          {renderInteractionHistory?.(item)}
          {children}
          {item.cut && <p className="note">{t("Output truncated")}</p>}
        </div>
      </StepDisclosure>
    );
  }
  function statusLabel(status) {
    return t(
      {
        inProgress: "Running",
        running: "Running",
        starting: "Running",
        pendingInit: "Pending",
        waiting: "Waiting for you",
        idle: "Ready",
        errored: "Failed",
        error: "Failed",
        shutdown: "Stopped",
        closed: "Stopped",
        stopped: "Stopped",
        blocked: "Blocked",
        notFound: "Unavailable",
        completed: "Completed",
        success: "Completed",
        approved: "Approved",
        denied: "Declined",
        timedOut: "Timed out",
        aborted: "Interrupted",
        failed: "Failed",
        declined: "Declined",
        pending: "Pending",
        interrupted: "Interrupted",
      }[status] || "Status unknown",
    );
  }
  function requestsFor(item) {
    if (Array.isArray(item.data?.items)) {
      const ids = new Set(
        item.data.items.flatMap(requestsFor).map((v) => v.id),
      );
      return getRequests().filter((request) => ids.has(request.id));
    }
    return getRequests().filter((value) => {
      const turnID = value.params?.turnId || value.params?.turn_id;
      const sourceMatches =
        (value.params?.itemId || value.params?.item_id) === item.id ||
        (value.method === "agentMessage/questions" &&
          value.id === JSON.stringify(["request_user_input_async", item.id]));
      return sourceMatches && (!turnID || turnID === item.turn_id);
    });
  }
  function requestLabel(requests) {
    return t(
      requests.some((request) =>
        ["question", "elicitation"].includes(getAgent().requestKind(request)),
      )
        ? "Waiting for you"
        : "Waiting for approval",
    );
  }
  function eventLabel(value) {
    if (value == null) return value;
    const label = {
      preToolUse: "Before tool use",
      permissionRequest: "Permission request",
      postToolUse: "After tool use",
      preCompact: "Before context compaction",
      postCompact: "After context compaction",
      sessionStart: "Session started",
      sessionEnd: "Session ended",
      userPromptSubmit: "User message submitted",
      subagentStart: "Subagent started",
      subagentStop: "Subagent stopped",
      stop: "Stop",
      interrupt: "Interrupt",
      sync: "Synchronous",
      async: "Asynchronous",
      command: "Command",
      mcpTool: "MCP tool",
      prompt: "Prompt",
      agent: "Agent",
      warning: "Warning",
      feedback: "Feedback",
      context: "Context",
      error: "Error",
      low: "Low",
      medium: "Medium",
      high: "High",
      critical: "Critical",
      unknown: "Unknown",
      execve: "Execute program",
      writeStdin: "Terminal input",
      applyPatch: "Apply patch",
      networkAccess: "Network access",
      mcpToolCall: "MCP tool call",
      requestPermissions: "Request permissions",
    }[value];
    return label ? t(label) : textOf(value);
  }
  function Pending({ item }) {
    return requestsFor(item).map((request) => (
      <p className="linked-request" key={JSON.stringify(request.id)}>
        <span>{requestLabel([request])}</span>
        {!readOnly && openRequest && (
          <Action action={() => openRequest(request)}>
            {t("Review request")}
          </Action>
        )}
      </p>
    ));
  }
  function TurnSummary({ id, items, changes }) {
    const live = getLive(),
      meta = items.find((value) => value.turn)?.turn || {},
      status = id === live.turn_id ? live.status : meta.status;
    const files = new Set(
        (changes
          ? changes
          : items.flatMap((value) =>
              value.type === "fileChange" ? value.data?.changes || [] : [],
            )
        ).map((change) => change.path),
      ),
      tools = items.filter((value) => toolCallTypes.has(value.type)),
      succeeded = tools.filter((value) => toolStatus(value) === "completed"),
      failed = tools.filter((value) => toolStatus(value) === "failed"),
      answer = items
        .filter((value) => value.type === "agentMessage")
        .map((value) => value.text || value.data?.text || "")
        .filter(Boolean)
        .join("\n\n");
    return (
      <div className="turn-summary" data-turn={id}>
        <span>
          {turnLabel ? turnLabel(id) : t("Turn")} · {statusLabel(status)}
        </span>
        <Action
          action={() => tools[0] && jumpToItem?.(tools[0].id)}
          disabled={!tools.length || !jumpToItem}
        >
          {tools.length} {t("Tool calls")}
        </Action>
        <Action
          action={() => succeeded[0] && jumpToItem?.(succeeded[0].id)}
          disabled={!succeeded.length || !jumpToItem}
        >
          {succeeded.length} {t("Successful tools")}
        </Action>
        <Action
          action={() => failed[0] && jumpToItem?.(failed[0].id)}
          disabled={!failed.length || !jumpToItem}
        >
          {failed.length} {t("Failed tools")}
        </Action>
        <Action
          action={() => openTurnChanges?.(id)}
          disabled={!files.size || !openTurnChanges}
        >
          {files.size} {t("files")}
        </Action>
        {isPartialHistory() && (
          <span className="note">{t("Loaded records only")}</span>
        )}
        {answer && <Copy text={answer} label="Copy turn answer" />}
        {meta.started_at_ms != null &&
          Number.isFinite(new Date(meta.started_at_ms).getTime()) && (
            <time>{new Date(meta.started_at_ms).toLocaleString()}</time>
          )}
        {meta.duration_ms != null && (
          <span>{formatDuration(meta.duration_ms)}</span>
        )}
      </div>
    );
  }
  function Copy({ text, label = "Copy" }) {
    const [copied, setCopied] = useState("");
    return (
      <Action
        action={async () => {
          await navigator.clipboard.writeText(String(text));
          setCopied(String(text));
        }}
        disabled={text == null || text === ""}
      >
        {t(copied && copied === String(text) ? "Copied" : label)}
      </Action>
    );
  }
  function ModelError({ item }) {
    const { error, items, attempt } = item.data,
      activityScope = useRef(scope),
      initial = useRef(
        expanded.get(item.id) ?? expandedState()["item:" + item.id] ?? false,
      ),
      label =
        item.status === "retrying"
          ? "Reconnecting…"
          : item.status === "recovered"
            ? "Connection restored"
            : item.status === "ended"
              ? "Model retries"
              : "Error";
    return (
      <details
        className="model-error failure-details"
        data-id={item.id}
        data-type="modelError"
        data-status={item.status}
        open={initial.current}
        onToggle={(event) =>
          rememberExpanded(
            item.id,
            event.currentTarget.open,
            activityScope.current,
          )
        }
      >
        <summary>
          <Icon name={item.status === "failed" ? "warning" : "connection"} />
          <span role="status">
            {t(label)}
            {attempt ? " " + attempt : ""}
          </span>
          <Icon name="chevron" className="fold-icon" />
        </summary>
        <div className="model-error-body">
          {error.message && <p>{error.message}</p>}
          {error.details && <p>{textOf(error.details)}</p>}
          {error.code !== "" && error.code != null && (
            <p>
              {t("Error code")}: {textOf(error.code)}
            </p>
          )}
          {error.itemID && jumpToItem && (
            <Action action={() => jumpToItem(error.itemID)}>
              {t("Go to failed operation")}
            </Action>
          )}
          {items.length > 1 && (
            <ol>
              {items.map((source) => (
                <li key={source.id}>
                  {source.id !== item.id && <span data-id={source.id} />}
                  {source.data?.message || source.text}
                  {source.data?.additionalDetails && (
                    <p>{textOf(source.data.additionalDetails)}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </details>
    );
  }
  function Raw({ id, value, label = "Details" }) {
    const key = "raw:" + id,
      activityScope = useRef(scope),
      initial = useRef(
        expanded.get(key) ?? expandedState()["item:" + key] ?? false,
      );
    return (
      value != null && (
        <details
          className="raw-details"
          open={initial.current}
          onToggle={(event) =>
            rememberExpanded(
              key,
              event.currentTarget.open,
              activityScope.current,
            )
          }
        >
          <summary>{t(label)}</summary>
          <pre className="output-json">{textOf(value)}</pre>
        </details>
      )
    );
  }
  function Thinking({ item, children }) {
    const key = "reasoning:" + item.id,
      activityScope = useRef(scope),
      initial = useRef(
        expanded.get(key) ?? expandedState()["item:" + key] ?? false,
      );
    return (
      <Reasoning
        data-id={item.id}
        data-type={item.type}
        className="activity thinking"
        label={t("Thinking")}
        thinkingLabel={t("Codex is thinking…")}
        thinking={item.status === "inProgress"}
        defaultOpen={initial.current}
        onToggle={(event) =>
          rememberExpanded(key, event.currentTarget.open, activityScope.current)
        }
      >
        {children}
      </Reasoning>
    );
  }
  function Resource({ part, cut = false }) {
    const [failed, setFailed] = useState(false);
    const image = ["image", "localImage", "inputImage"].includes(part.type),
      value =
        part.url ||
        part.imageUrl ||
        (part.mimeType && part.data
          ? `data:${part.mimeType};base64,${part.data}`
          : ""),
      source = typeof value === "string" ? value : "";
    const name =
      part.name ||
      part.title ||
      part.path ||
      part.savedPath ||
      part.uri ||
      (image
        ? t("Attached image")
        : source.startsWith("data:")
          ? t("Attachment")
          : source || t("Attachment"));
    const downloadable =
        !cut &&
        image &&
        /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          source,
        ) &&
        source.length < 2 * 1024 * 1024,
      inline = downloadable && !failed;
    const path = resourcePath({ ...part, url: source || part.url }),
      url = externalURL(part.uri || part.url);
    return (
      <div className="resource-card">
        {inline && (
          <img
            className="artifact-image"
            src={source}
            alt={String(name)}
            onError={() => setFailed(true)}
          />
        )}
        <strong>{String(name).slice(0, 300)}</strong>
        {downloadable && (
          <a
            href={source}
            download={String(name).split(/[\\/]/).at(-1) || "image.png"}
          >
            {t("Download")}
          </a>
        )}
        {failed && (
          <span className="note">{t("Resource preview failed.")}</span>
        )}
        {!cut && !readOnly && part.attachment_id && openAttachment ? (
          <Action
            action={() => openAttachment(part.attachment_id, String(name))}
          >
            {t("Open file")}
          </Action>
        ) : !cut && !readOnly && path && openProjectFile ? (
          <Action action={() => openProjectFile(path)}>
            {t(image ? "View image" : "Open file")}
          </Action>
        ) : !cut && url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {t("Open resource")}
          </a>
        ) : (
          !inline &&
          !failed && (
            <span className="note">
              {t(
                cut
                  ? "Resource unavailable: output truncated."
                  : image &&
                      source.startsWith("data:") &&
                      source.length >= 2 * 1024 * 1024
                    ? "Resource unavailable: inline image exceeds the preview size limit."
                    : source.startsWith("data:")
                      ? "Resource unavailable: unsupported inline image format."
                      : "Resource unavailable in the authorized project or attachments.",
              )}
            </span>
          )
        )}
      </div>
    );
  }
  function ToolContent({ id, value, cut }) {
    if (typeof value === "string")
      return <div className="tool-text">{markdown(value)}</div>;
    if (!value) return null;
    const parts = Array.isArray(value)
      ? value
      : value.content || value.contentItems;
    if (Array.isArray(parts))
      return parts.map((part, index) => (
        <ToolContent key={index} id={id + ":" + index} value={part} cut={cut} />
      ));
    if (
      ["text", "inputText", "outputText"].includes(value.type) ||
      typeof value.text === "string"
    )
      return <div className="tool-text">{markdown(value.text)}</div>;
    if (
      [
        "image",
        "localImage",
        "inputImage",
        "resource_link",
        "resourceLink",
        "file",
        "attachment",
      ].includes(value.type)
    )
      return <Resource part={value} cut={cut} />;
    if (value.type === "resource")
      return (
        <ToolContent id={id + ":resource"} value={value.resource} cut={cut} />
      );
    if (value.uri) return <Resource part={value} cut={cut} />;
    return <Raw id={id} value={value} label="Result" />;
  }
  function textOf(value) {
    if (value === null || value === undefined) return "";
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }
  function Item({ item, className = "" }) {
    const data = item.data || {},
      type = item.type,
      text = item.text || "",
      props = { item, status: item.status, className };
    if (["userMessage", "steeringUserMessage", "agentMessage"].includes(type)) {
      const user = type !== "agentMessage",
        input = type === "steeringUserMessage" ? data.input : data.content,
        content = Array.isArray(input)
          ? getAgent().displayUserContent(input)
          : null,
        plain = content ? contentText(content) : text;
      const status = data.status || item.status;
      return (
        <Message
          as="article"
          align={user ? "end" : "start"}
          data-id={item.id}
          data-type={type}
          className={"message " + (user ? "user" : "agent")}
          data-phase={data.phase || undefined}
        >
          <MessageContent>
            <Bubble
              variant={user ? "muted" : "ghost"}
              align={user ? "end" : "start"}
            >
              <BubbleContent className="message-body">
                {user ? (
                  <>
                    {plain && <p className="user-text">{plain}</p>}
                    <UserAttachments content={content} />
                    {!plain &&
                      !content?.some((part) =>
                        [
                          "image",
                          "localImage",
                          "audio",
                          "localAudio",
                          "file",
                          "attachment",
                          "mention",
                          "skill",
                          "tool",
                        ].includes(part.type),
                      ) &&
                      t("Attachment")}
                    {type === "steeringUserMessage" &&
                      ["pending", "accepted"].includes(status) && (
                        <p className="message-status">
                          {t(status === "accepted" ? "Accepted" : "Pending")}
                        </p>
                      )}
                  </>
                ) : (
                  <>
                    <div className="agent-message-heading">
                      <Icon name={getAgent().icon} />
                      <strong>{getAgent().name}</strong>
                    </div>
                    {data.phase && (
                      <p className="message-phase">
                        {t(
                          {
                            commentary: "Progress update",
                            partial_answer: "Partial answer",
                            final_answer: "Final answer",
                          }[data.phase] || data.phase,
                        )}
                      </p>
                    )}
                    {markdown(text || data.text || "")}
                    <Pending item={item} />
                    {(text || data.text) && (
                      <Copy text={text || data.text} label="Copy answer" />
                    )}
                  </>
                )}
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      );
    }
    if (type === "toolBatch") {
      const items = data.items || [],
        statuses = items.map(toolStatus),
        status = statuses.includes("inProgress")
          ? "inProgress"
          : statuses.includes("failed")
            ? "failed"
            : statuses.includes("pending")
              ? "pending"
              : statuses.length &&
                  statuses.every((value) => value === "completed")
                ? "completed"
                : "";
      return (
        <Activity
          {...props}
          title="Tool calls"
          subtitle={String(items.length)}
          symbol="tool"
          status={status}
          kind="tool-batch"
          open={status === "inProgress"}
        >
          {items.map((child) => (
            <Item key={child.id} item={child} className="tool-batch-item" />
          ))}
        </Activity>
      );
    }
    if (type === "backgroundActivity")
      return (
        <Activity
          {...props}
          title="Background activity"
          subtitle={String(data.items.length)}
          symbol="tool"
          status={
            data.items.some((child) => child.status === "failed")
              ? "failed"
              : data.items.some((child) => child.status === "inProgress")
                ? "inProgress"
                : ""
          }
          kind="background-event"
        >
          {data.items.map((child) => (
            <Item key={child.id} item={child} />
          ))}
        </Activity>
      );
    if (type === "reasoning") {
      const reasoning =
        [...(data.summary || []), ...(data.content || [])]
          .filter((x) => typeof x === "string")
          .join("\n\n") || text;
      return (
        <Thinking item={item}>
          {reasoning || t("Reasoning details are not exposed by this model.")}
        </Thinking>
      );
    }
    if (type === "commandExecution")
      return (
        <Activity
          {...props}
          title="Command"
          subtitle={commandSummary(data, t) || data.command || firstLine(text)}
          symbol="terminal"
          status={toolStatus(item)}
          kind="command"
          open={item.status === "inProgress"}
        >
          {data.command && <div className="command-line">$ {data.command}</div>}
          {data.command && <Copy text={data.command} label="Copy command" />}
          {data.cwd && <div className="command-footer">{data.cwd}</div>}
          <pre className="command-output">
            {data.aggregatedOutput || text || t("Waiting for output…")}
          </pre>
          {(data.aggregatedOutput || text) && (
            <Copy text={data.aggregatedOutput || text} label="Copy output" />
          )}
          {(
            data.terminalInteractions ||
            (data.terminalInteraction ? [data.terminalInteraction] : [])
          ).map((entry, index) => (
            <div key={index}>
              <p className="eyebrow">{t("Terminal input")}</p>
              <pre className="command-output">
                {entry.stdin || entry.input || entry.text || t("Unknown")}
              </pre>
            </div>
          ))}
          <div className="command-footer">
            {[
              data.exitCode != null ? t("Exit code") + " " + data.exitCode : "",
              data.durationMs != null ? formatDuration(data.durationMs) : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </Activity>
      );
    if (type === "fileChange") {
      const changes = data.changes || [];
      return (
        <Activity
          {...props}
          title="File changes"
          subtitle={
            changes.length ? String(changes.length) + " " + t("files") : ""
          }
          symbol="diff"
          kind="file-change"
          open
        >
          {changes.map((change, index) =>
            readOnly ? (
              <pre key={index} className="output-json">
                {change.path + "\n" + displayDiff(change).text}
              </pre>
            ) : (
              <Action
                key={index}
                className="changed-file-button"
                action={() => openChanges(change.path, item.id + "|" + index)}
              >
                <span>{change.path}</span>
                <DiffStats change={change} />
              </Action>
            ),
          )}
          {!changes.length && <pre className="output-json">{text}</pre>}
          <Copy
            text={
              changes
                .map((change) => change.path + "\n" + displayDiff(change).text)
                .join("\n\n") || text
            }
            label="Copy diff"
          />
        </Activity>
      );
    }
    if (type === "plan")
      return (
        <Activity {...props} title="Plan" symbol="plan" kind="plan-result" open>
          {markdown(text || data.text || "")}
        </Activity>
      );
    if (type === "webSearch") {
      const action = searchAction(data);
      return (
        <Activity
          {...props}
          status={toolStatus(item)}
          title={action.label}
          subtitle={action.query || action.url || text}
          symbol="globe"
        >
          <p>{action.query}</p>
          {action.queries.map((query) => (
            <p key={query}>{query}</p>
          ))}
          {action.url && !item.cut && (
            <a href={action.url} target="_blank" rel="noopener noreferrer">
              {action.url}
            </a>
          )}
          {Array.isArray(data.sources) &&
            data.sources.map((source, index) =>
              externalURL(source.url) && !item.cut ? (
                <p key={index}>
                  <a
                    href={externalURL(source.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.title || source.url}
                  </a>
                </p>
              ) : null,
            )}
          <Raw id={item.id + "|action"} value={data.action} />
        </Activity>
      );
    }
    if (type === "mcpToolCall" || type === "dynamicToolCall") {
      const status = toolStatus(item),
        output = data.contentItems || data.result || data.error || text;
      return (
        <Activity
          {...props}
          status={status}
          title="Tool call"
          subtitle={[data.server, data.tool || data.name]
            .filter(Boolean)
            .join(" / ")}
          symbol="tool"
          open={status === "inProgress"}
        >
          {data.progress && <p role="status">{textOf(data.progress)}</p>}
          <Raw
            id={item.id + "|arguments"}
            value={data.arguments}
            label="Arguments"
          />
          <ToolContent
            id={item.id + "|result"}
            value={
              data.contentItems ||
              data.result ||
              data.error?.message ||
              data.error ||
              text ||
              t("Waiting for output…")
            }
            cut={item.cut}
          />
          {output != null && output !== "" && (
            <Copy text={textOf(output)} label="Copy output" />
          )}
          {data.durationMs != null && (
            <p className="note">{formatDuration(data.durationMs)}</p>
          )}
        </Activity>
      );
    }
    if (type === "collabAgentToolCall" || type === "collabToolCall") {
      const ids = [
        ...new Set([
          ...(data.receiverThreadIds || []),
          ...(data.receiverThreads || []).map(
            (agent) => agent.threadId || agent.id,
          ),
          ...Object.keys(data.agentsStates || {}),
        ]),
      ];
      return (
        <Activity
          {...props}
          title="Agent"
          subtitle={t(
            {
              spawnAgent: "Create agent",
              sendInput: "Send to agent",
              wait: "Wait for agents",
              closeAgent: "Close agent",
              resumeAgent: "Resume agent",
            }[data.tool] ||
              data.tool ||
              "Agent",
          )}
          symbol="agent"
        >
          {ids.map((id) => {
            const agent = getSubagents().find((value) => value.id === id),
              receiver = (data.receiverThreads || []).find(
                (value) => (value.threadId || value.id) === id,
              );
            return (
              <div key={id} className="agent-call-link">
                {agent && openSubagent && !readOnly ? (
                  <Action action={() => openSubagent(id)}>
                    {agent.name || agent.role || id}
                  </Action>
                ) : (
                  <span>{receiver?.agentNickname || receiver?.name || id}</span>
                )}
                <span>
                  {statusLabel(
                    data.agentsStates?.[id]?.status || agent?.status,
                  )}
                </span>
              </div>
            );
          })}
          {data.prompt && (
            <div className="tool-text">{markdown(data.prompt)}</div>
          )}
          <Raw id={item.id + "|details"} value={data} />
        </Activity>
      );
    }
    if (["imageView", "imageGeneration", "fileArtifact"].includes(type)) {
      const source =
        data.src ||
        data.url ||
        (type === "imageGeneration" &&
        typeof data.result === "string" &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(data.result)
          ? "data:image/png;base64," + data.result
          : data.result);
      return (
        <Activity
          {...props}
          title={
            type === "imageGeneration"
              ? "Generated image"
              : type === "imageView"
                ? "View image"
                : "Artifact"
          }
          symbol="image"
          open
        >
          <Resource
            part={{
              ...data,
              type: type === "fileArtifact" ? "file" : "image",
              path: data.path || data.savedPath,
              url: source,
            }}
            cut={item.cut}
          />
        </Activity>
      );
    }
    if (type === "modelError") return <ModelError item={item} />;
    if (
      [
        "systemEvent",
        "warning",
        "configWarning",
        "modelRerouted",
        "hook",
        "hookPrompt",
        "approvalReview",
      ].includes(type)
    ) {
      const label =
        type === "approvalReview"
          ? "Automatic review"
          : type.startsWith("hook")
            ? "Hook"
            : type === "modelRerouted" || data.name === "model/rerouted"
              ? "Model changed"
              : "System notice";
      const review = data.review || {},
        action = data.action || {},
        hook = type.startsWith("hook") || data.name === "hook",
        duration =
          data.durationMs ??
          (typeof data.startedAtMs === "number" &&
          typeof data.completedAtMs === "number" &&
          data.completedAtMs >= data.startedAtMs
            ? data.completedAtMs - data.startedAtMs
            : null);
      return (
        <Activity
          {...props}
          title={label}
          subtitle={
            eventLabel(data.eventName) ||
            data.name ||
            data.hookName ||
            data.event ||
            ""
          }
          symbol="tool"
          status={
            type === "approvalReview"
              ? review.status || item.status
              : data.status || item.status
          }
        >
          <p>
            {textOf(
              data.message ||
                data.summary ||
                data.statusMessage ||
                data.review?.rationale ||
                data.review?.reason ||
                text,
            )}
          </p>
          {hook && (
            <>
              <dl className="event-fields">
                {[
                  ["Trigger", eventLabel(data.eventName)],
                  ["Execution mode", eventLabel(data.executionMode)],
                  ["Handler", eventLabel(data.handlerType)],
                  ["Source", data.sourcePath],
                ].map(
                  ([name, value]) =>
                    value != null && (
                      <div key={name}>
                        <dt>{t(name)}</dt>
                        <dd>{textOf(value)}</dd>
                      </div>
                    ),
                )}
              </dl>
              {(Array.isArray(data.entries) ? data.entries : []).map(
                (entry, index) => (
                  <p key={index}>
                    {entry.kind && <strong>{eventLabel(entry.kind)}: </strong>}
                    {entry.text}
                  </p>
                ),
              )}
            </>
          )}
          {type === "approvalReview" && (
            <>
              <dl className="event-fields">
                {[
                  ["Action", eventLabel(action.type)],
                  ["Command", action.command],
                  ["Working directory", action.cwd],
                  ["MCP server", action.server],
                  ["Tool", action.toolName],
                  ["Risk level", eventLabel(review.riskLevel)],
                  ["User authorization", eventLabel(review.userAuthorization)],
                  ["Decision source", eventLabel(data.decisionSource)],
                ].map(
                  ([name, value]) =>
                    value != null && (
                      <div key={name}>
                        <dt>{t(name)}</dt>
                        <dd>{textOf(value)}</dd>
                      </div>
                    ),
                )}
              </dl>
              {data.targetItemId && jumpToItem && (
                <Action action={() => jumpToItem(data.targetItemId)}>
                  {t("Go to related operation")}
                </Action>
              )}
            </>
          )}
          {duration != null && (
            <p className="note">{formatDuration(duration)}</p>
          )}
          {data.fromModel && (
            <p>
              {data.fromModel} → {data.toModel || t("Unknown")}
            </p>
          )}
          {(data.review?.decision || data.decision) && (
            <p>{textOf(data.review?.decision || data.decision)}</p>
          )}
          <Raw id={item.id + "|details"} value={data} />
        </Activity>
      );
    }
    if (
      ["contextCompaction", "enteredReviewMode", "exitedReviewMode"].includes(
        type,
      )
    )
      return (
        <p data-id={item.id} data-type={type} className="event-note">
          {t(
            type === "contextCompaction"
              ? item.status === "failed"
                ? "Context compaction failed"
                : item.status === "inProgress"
                  ? "Compacting context…"
                  : item.status === "completed"
                    ? "Context compacted"
                    : "Status unknown"
              : type === "enteredReviewMode"
                ? "Review started"
                : "Review completed",
          )}
          {text && " · " + text}
        </p>
      );
    return (
      <Activity
        {...props}
        title={data.name || "Tool"}
        subtitle={type === "legacyTool" ? "" : type}
        symbol="tool"
      >
        <pre className="output-json">{text || textOf(data)}</pre>
        <Copy text={text || textOf(data)} label="Copy output" />
      </Activity>
    );
  }
  function contentText(content) {
    return (content || [])
      .map((p) => (typeof p.text === "string" ? p.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  function UserAttachment({ part }) {
    const [failed, setFailed] = useState(false),
      name =
        part.name ||
        part.filename ||
        (part.path
          ? projectName(part.path)
          : ["image", "localImage"].includes(part.type)
            ? t("Attached image")
            : ["audio", "localAudio"].includes(part.type)
              ? t("Attached audio")
              : t("Attachment"));
    if (
      !failed &&
      part.type === "image" &&
      typeof part.url === "string" &&
      /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(
        part.url,
      ) &&
      part.url.length < 2 * 1024 * 1024
    )
      return (
        <Attachment size="sm" className="image-attachment">
          <AttachmentMedia variant="image">
            <img
              src={part.url}
              alt={name}
              className="image-message"
              onError={() => setFailed(true)}
            />
          </AttachmentMedia>
        </Attachment>
      );
    if (
      (part.path || part.attachment_id) &&
      ["image", "localImage", "file", "attachment"].includes(part.type)
    )
      return <Resource part={{ ...part, name }} />;
    return (
      <Tag
        className="attachment-chip"
        icon={
          <Icon
            name={
              ["image", "localImage"].includes(part.type)
                ? "image"
                : part.type === "tool"
                  ? "tool"
                  : part.type === "skill"
                    ? "plan"
                    : "file"
            }
          />
        }
      >
        <span className="file-name">{name}</span>
      </Tag>
    );
  }
  function UserAttachments({ content }) {
    return (
      <div className="message-user-attachments">
        {(content || [])
          .filter((part) =>
            [
              "image",
              "localImage",
              "audio",
              "localAudio",
              "file",
              "attachment",
              "mention",
              "skill",
              "tool",
            ].includes(part.type),
          )
          .map((part, index) => (
            <UserAttachment key={index} part={part} />
          ))}
      </div>
    );
  }

  function firstLine(text) {
    return text.split("\n")[0].slice(0, 150);
  }
  function formatDuration(ms) {
    return ms < 1000 ? ms + " ms" : (ms / 1000).toFixed(1) + " s";
  }
  function displayDiff(change) {
    const text = change.diff || "",
      kind = typeof change.kind === "string" ? change.kind : change.kind?.type;
    const unified =
      /^diff --git /m.test(text) ||
      /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(text) ||
      /^--- [^\n]*\n\+\+\+ /m.test(text);
    if (["add", "delete"].includes(kind) && !unified) {
      const lines = text ? text.replace(/\r\n/g, "\n").split("\n") : [];
      if (lines.at(-1) === "") lines.pop();
      return {
        text: lines
          .map((line) => (kind === "add" ? "+" : "-") + line)
          .join("\n"),
        additions: kind === "add" ? lines.length : 0,
        deletions: kind === "delete" ? lines.length : 0,
      };
    }
    let additions = 0,
      deletions = 0,
      inHunk = false;
    for (const line of text.split("\n")) {
      if (line.startsWith("diff --git ")) inHunk = false;
      if (line.startsWith("@@")) inHunk = true;
      if (line.startsWith("+") && (inHunk || !line.startsWith("+++")))
        additions++;
      if (line.startsWith("-") && (inHunk || !line.startsWith("---")))
        deletions++;
    }
    return { text, additions, deletions };
  }
  function DiffStats({ change }) {
    const { additions, deletions } = displayDiff(change);
    return (
      <span className="change-stats">
        <span className="additions">+{additions}</span>
        <span className="deletions">−{deletions}</span>
      </span>
    );
  }

  return {
    mergeOrdered,
    renderItems,
    legacyItems,
    displayDiff,
    DiffStats,
    textOf,
    Copy,
    Resource,
  };
}
