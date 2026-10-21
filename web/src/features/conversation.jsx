import { renderView } from "../render";
import { useRef, useState } from "react";
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
  readOnly = false,
}) {
  function mergeOrdered(existing, incoming, prepend = false, beforeID = "") {
    if (!incoming.length) return existing;
    const values = new Map(existing.map((item) => [item.id, item])),
      order = existing.map((item) => item.id);
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
    "legacyTool",
  ]);
  function renderItems(root, items) {
    const grouped = [];
    for (const item of items) {
      if (
        /^(hook|systemEvent|tokenCount)$/.test(item.type) ||
        item.data?.name === "hook"
      ) {
        const previous = grouped.at(-1);
        if (previous?.type === "backgroundActivity")
          previous.data.items.push(item);
        else
          grouped.push({
            id: "background-" + item.id,
            type: "backgroundActivity",
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
    renderView(
      root,
      grouped.map((item) => <Item key={item.id} item={item} />),
    );
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
    const initial = useRef(open);
    return (
      <StepDisclosure
        data-id={item.id}
        data-type={item.type}
        className={"activity " + kind + " " + className}
        open={initial.current}
      >
        <summary>
          <Icon name={symbol} />
          <span className="activity-title">{t(title)}</span>
          <span className="activity-subtitle">{subtitle || ""}</span>
          <span className="activity-meta">{statusLabel(status)}</span>
          <Icon name="chevron" className="fold-icon" />
        </summary>
        <div className="activity-body">{children}</div>
      </StepDisclosure>
    );
  }
  function statusLabel(status) {
    return t(
      {
        inProgress: "Running",
        completed: "Completed",
        failed: "Failed",
        declined: "Declined",
        pending: "Pending",
        interrupted: "Interrupted",
      }[status] || "",
    );
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
                  markdown(text || data.text || "")
                )}
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      );
    }
    if (type === "toolBatch") {
      const items = data.items || [],
        statuses = items.map(
          (child) => child.status || child.data?.status || "",
        ),
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
          status="completed"
          kind="background-event"
        >
          {data.items.map((child) => (
            <pre key={child.id} className="output-json background-item">
              {child.text || textOf(child.data)}
            </pre>
          ))}
        </Activity>
      );
    if (type === "reasoning") {
      const reasoning =
        [...(data.summary || []), ...(data.content || [])]
          .filter((x) => typeof x === "string")
          .join("\n\n") || text;
      return (
        <Reasoning
          data-id={item.id}
          data-type={type}
          className="activity thinking"
          label={t("Thinking")}
          thinkingLabel={t("Codex is thinking…")}
          thinking={item.status === "inProgress"}
        >
          {reasoning || t("Reasoning details are not exposed by this model.")}
        </Reasoning>
      );
    }
    if (type === "commandExecution")
      return (
        <Activity
          {...props}
          title="Command"
          subtitle={data.command || firstLine(text)}
          symbol="terminal"
          status={item.status || data.status}
          kind="command"
          open={item.status === "inProgress"}
        >
          {data.command && <div className="command-line">$ {data.command}</div>}
          {data.cwd && <div className="command-footer">{data.cwd}</div>}
          <pre className="command-output">
            {data.aggregatedOutput || text || t("Waiting for output…")}
          </pre>
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
      const query = data.query || data.action?.query || text;
      return (
        <Activity {...props} title="Web search" subtitle={query} symbol="globe">
          <pre className="output-json">{textOf(data.action || query)}</pre>
        </Activity>
      );
    }
    if (type === "mcpToolCall" || type === "dynamicToolCall")
      return (
        <Activity
          {...props}
          title="Tool call"
          subtitle={[data.server, data.tool || data.name]
            .filter(Boolean)
            .join(" / ")}
          symbol="tool"
        >
          {data.arguments && (
            <>
              <p className="eyebrow">{t("Arguments")}</p>
              <pre className="output-json">{textOf(data.arguments)}</pre>
            </>
          )}
          <p className="eyebrow">{t("Result")}</p>
          <pre className="output-json">
            {textOf(data.result || data.error || text) ||
              t("Waiting for output…")}
          </pre>
        </Activity>
      );
    if (type === "collabAgentToolCall")
      return (
        <Activity
          {...props}
          title="Agent"
          subtitle={[data.tool, data.senderThreadId]
            .filter(Boolean)
            .join(" · ")}
          symbol="agent"
        >
          <pre className="output-json">{text || textOf(data)}</pre>
        </Activity>
      );
    if (
      ["contextCompaction", "enteredReviewMode", "exitedReviewMode"].includes(
        type,
      )
    )
      return (
        <p data-id={item.id} data-type={type} className="event-note">
          {t(
            type === "contextCompaction"
              ? "Context compacted"
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
  };
}
