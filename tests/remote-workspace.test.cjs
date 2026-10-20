const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { test } = require("node:test");
const { chromium, webkit } = require("playwright");
const { encryptedFixture, pairCode } = require("./e2ee-fixture.cjs");

const assets = path.resolve(__dirname, "../internal/relay/assets");
const engines = process.env.BROWSER
  ? [process.env.BROWSER]
  : ["chromium", "webkit"];
const project = "/work/shop";
const otherProject = "/work/docs";
const session = {
  id: "remote-rich",
  title: "Build checkout",
  cwd: project,
  last: "2026-10-17T09:30:00Z",
};
const defaults = {
  model: "codex-main",
  effort: "medium",
  permission: "workspace-write",
  mode: "default",
};
const patch = (before, after) =>
  `diff --git a/src/cart.ts b/src/cart.ts\n--- a/src/cart.ts\n+++ b/src/cart.ts\n@@ -1 +1 @@\n-${before}\n+${after}\n`;
const catalog = {
  models: [
    {
      id: "codex-main",
      model: "codex-main",
      displayName: "Codex Main",
      description: "Coding model",
      isDefault: true,
      defaultReasoningEffort: "medium",
      inputModalities: ["text", "image"],
      supportedReasoningEfforts: [
        { reasoningEffort: "medium", description: "Balanced reasoning" },
        { reasoningEffort: "high", description: "More reasoning" },
      ],
    },
    {
      id: "codex-fast",
      model: "codex-fast",
      displayName: "Codex Fast",
      description: "Fast coding",
      defaultReasoningEffort: "low",
      inputModalities: ["text", "image"],
      supportedReasoningEfforts: [
        { reasoningEffort: "low", description: "Quick reasoning" },
        { reasoningEffort: "high", description: "More reasoning" },
      ],
    },
  ],
  defaults,
  modes: [
    { name: "Default", mode: "default" },
    { name: "Plan", mode: "plan" },
  ],
  permissions: [
    {
      id: "workspace-write",
      name: "Ask for approval",
      description:
        "Always ask before editing external files or using the internet.",
      available: true,
    },
    {
      id: "auto-review",
      name: "Approve for me",
      description: "Only ask for actions detected as potentially unsafe.",
      available: true,
    },
    {
      id: "full-access",
      name: "Full access",
      description:
        "Unrestricted access to the internet and any file on this computer.",
      available: true,
    },
  ],
  skills: [
    {
      name: "repo-style",
      path: "/work/shop/.agents/skills/repo-style/SKILL.md",
      description: "Follow this repository style",
      enabled: true,
    },
  ],
  tools: [
    {
      server: "docs",
      name: "lookup",
      description: "Find project documentation",
    },
  ],
  capabilities: {
    background_creation: true,
    attachments: true,
    steer: true,
    queue: true,
    approval_modes: true,
    skills: true,
    tools: true,
    plan: true,
    diffs: true,
    questions: true,
  },
};

const attachedName = 'cart "notes"\\review.txt';
const attachmentPath =
  "/Users/fixture/.codex/remote/attachments/71ca2a4b/data.txt";
const quotedUserText =
  "This user paragraph mentions User attached file, User referenced, Read this file, and User selected as example labels. Keep this paragraph verbatim.";
function steeringItem(
  id,
  input,
  status = "accepted",
  turnID = "steering-turn",
) {
  return {
    id,
    type: "steeringUserMessage",
    status: "completed",
    turn_id: turnID,
    data: {
      id,
      type: "steeringUserMessage",
      status,
      targetTurnId: turnID,
      clientUserMessageId: id,
      input,
    },
  };
}
function richItems() {
  const content = [
    { type: "text", text: "Improve the cart" },
    {
      type: "text",
      text: `User attached file ${JSON.stringify(attachedName)}, available locally at ${JSON.stringify(attachmentPath)}. Read this file using the available tools when relevant.`,
    },
    {
      type: "text",
      text: `User referenced project file "cart.ts" at "${project}/src/cart.ts".`,
    },
    {
      type: "text",
      text: 'The user selected MCP tool "lookup" on server "docs" for this request. Use it when relevant.',
    },
    {
      type: "skill",
      name: "repo-style",
      path: "/Users/fixture/.agents/skills/repo-style/SKILL.md",
    },
    {
      type: "image",
      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/hUAAAAASUVORK5CYII=",
    },
  ];
  return [
    {
      id: "user-1",
      type: "userMessage",
      turn_id: "turn-1",
      text: content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n"),
      data: { content },
    },
    {
      id: "user-quoted",
      type: "userMessage",
      turn_id: "turn-1",
      text: quotedUserText,
      data: { content: [{ type: "text", text: quotedUserText }] },
    },
    {
      id: "think-1",
      type: "reasoning",
      turn_id: "turn-1",
      status: "completed",
      data: {
        summary: ["Inspecting cart state and existing tests."],
        content: [],
      },
    },
    {
      id: "cmd-1",
      type: "commandExecution",
      turn_id: "turn-1",
      status: "completed",
      data: {
        command: "npm test -- cart",
        cwd: project,
        aggregatedOutput: "cart.test.ts: 3 passed",
        exitCode: 0,
        durationMs: 1250,
      },
    },
    {
      id: "tool-1",
      type: "mcpToolCall",
      turn_id: "turn-1",
      status: "completed",
      data: {
        server: "docs",
        tool: "lookup",
        arguments: { query: "cart" },
        result: { content: [{ type: "text", text: "Use the cart store." }] },
      },
    },
    {
      id: "change-1",
      type: "fileChange",
      turn_id: "turn-1",
      status: "completed",
      data: {
        changes: [
          { path: "src/cart.ts", diff: patch("before", "intermediate") },
        ],
      },
    },
    {
      id: "answer-1",
      type: "agentMessage",
      turn_id: "turn-1",
      text: '# Cart update\n\n**Tests passed.** Use `cart.total`.\n\n- Preserves totals\n- Adds tests\n\n```ts\nconst total = cart.total;\n```\n\n| Check | Result |\n| --- | --- |\n| Cart | Passed |\n\n<img src=x onerror="window.remoteXSS=true">\n\n[Unsafe](javascript:alert(1))',
    },
  ];
}

async function fixture(t, engine, options = {}) {
  let origin = "https://remote.test";
  if (options.downloadServer) {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, origin);
      if (
        url.pathname !== "/api/project-file" ||
        !url.searchParams.has("download")
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      const name = path.posix.basename(url.searchParams.get("path"));
      const content =
        options.fileContents?.[name] ??
        (name === "测试.txt" ? "测试内容" : "export const total = 42;\n");
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      });
      res.end(content);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = "http://127.0.0.1:" + server.address().port;
    t.after(() => new Promise((resolve) => server.close(resolve)));
  }
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  t.after(() => browser.close());
  const page = await browser.newPage({
    viewport: { width: options.width || 1440, height: options.height || 960 },
    locale: options.locale || "en-US",
    ...(options.mobile
      ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
      : {}),
  });
  await encryptedFixture(page);
  if (options.clock) await page.clock.install();
  page.setDefaultTimeout(10000);
  if (options.streaming) {
    await page.clock.install();
    await page.addInitScript(() => {
      window.fixtureStreams = [];
      class FixtureEventSource {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSED = 2;
        constructor(url) {
          this.url = new URL(url, location.href).href;
          this.readyState = 0;
          this.closed = false;
          this.listeners = {};
          window.fixtureStreams.push(this);
        }
        addEventListener(type, listener) {
          (this.listeners[type] ||= []).push(listener);
        }
        close() {
          this.closed = true;
          this.readyState = 2;
        }
        open() {
          this.readyState = 1;
          this.onopen?.(new Event("open"));
        }
        fail() {
          this.readyState = 0;
          this.onerror?.(new Event("error"));
        }
        emit(packet) {
          const event = { data: JSON.stringify(packet) };
          for (const listener of this.listeners.live || []) listener(event);
        }
        emitEvent(type, packet) {
          const event = { data: JSON.stringify(packet) };
          for (const listener of this.listeners[type] || []) listener(event);
        }
      }
      window.EventSource = FixtureEventSource;
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          window.RemoteSecure.events = (path) =>
            new FixtureEventSource("/api/" + path);
        },
        { once: true },
      );
    });
  }
  const seen = {
    lists: [],
    details: [],
    posts: [],
    agentHeaders: [],
    options: [],
    files: [],
    previews: [],
    changes: [],
    plans: [],
    queues: [],
    queueDeletes: [],
    queueEdits: [],
    uploads: [],
    deletes: [],
    history: [],
    errors: [],
    unknown: [],
  };
  const state = {
    paired: false,
    rows: options.rows || [session],
    projects: options.projects || [project],
    live: { status: "idle", items: [], requests: [] },
    historyItems: [],
    sessionOptions: { ...defaults },
    workspaceChanges: [],
    pendingPlan: null,
    executeError: "",
    queues: {},
    queueRevisions: {},
    queuePaused: {},
    queueErrors: {},
    queueReceipts: {},
    abortedEnqueue: false,
    enqueueError: "",
    steerError: "",
    queueEditError: "",
    ...options.state,
  };
  const queueSnapshot = (id) => ({
    queue: (state.queues[id] ||= []),
    revision: state.queueRevisions[id] || 0,
    paused: !!state.queuePaused[id],
    error: state.queueErrors[id] || "",
  });
  const queueChanged = (id) => {
    state.queueRevisions[id] = (state.queueRevisions[id] || 0) + 1;
    return queueSnapshot(id);
  };
  page.on("pageerror", (error) => seen.errors.push(error.message));
  await page.route("**/*", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      method = req.method();
    if (u.protocol === "blob:") return route.continue();
    if (u.origin !== origin) {
      seen.unknown.push(req.url());
      return route.abort();
    }
    if (u.pathname.startsWith("/api/")) {
      assert(
        !u.search.includes("fixture-key"),
        "pairing key must stay out of request URLs",
      );
      const multipart = (req.headers()["content-type"] || "").startsWith(
        "multipart/form-data",
      );
      const data = req.postData() && !multipart ? req.postDataJSON() : {};
      if (req.headers()["x-remote-agent"])
        seen.agentHeaders.push({
          path: u.pathname,
          agent: req.headers()["x-remote-agent"],
        });
      if (method === "POST" && !multipart)
        seen.posts.push({
          path: u.pathname,
          data,
          ...(req.headers()["x-remote-owner-epoch"]
            ? { ownerEpoch: req.headers()["x-remote-owner-epoch"] }
            : req.headers()["x-codex-owner-epoch"]
              ? { ownerEpoch: req.headers()["x-codex-owner-epoch"] }
              : {}),
        });
      if (u.pathname === "/api/pair") {
        assert.equal(data.key, pairCode);
        state.paired = true;
        return route.fulfill({ json: { paired: true } });
      }
      if (!state.paired)
        return route.fulfill({
          status: 401,
          json: { error: "Pair this browser first" },
        });
      if (u.pathname === "/api/device")
        return route.fulfill({
          json: {
            id: "fixture-device",
            name: "My computer",
            online: state.online !== false,
          },
        });
      if (u.pathname === "/api/agents")
        return route.fulfill({
          json:
            typeof options.agents === "function"
              ? options.agents(state)
              : options.agents || {
                  agents: [{ id: "codex", name: "Codex" }],
                  default_agent: "codex",
                },
        });
      if (u.pathname === "/api/sessions") {
        seen.lists.push(Object.fromEntries(u.searchParams));
        if (options.beforeList) await options.beforeList(state, seen);
        const selected = u.searchParams.get("project");
        const rows = state.rows.filter(
          (row) =>
            !selected ||
            row.cwd === selected ||
            row.cwd.startsWith(selected + "/"),
        );
        return route.fulfill({
          json: {
            sessions: state.historyUnavailable ? [] : rows,
            projects: state.projects,
            total: rows.length,
            next: rows.length,
            has_more: false,
            archived_ids: state.archivedIDs || [],
            history_unavailable: !!state.historyUnavailable,
            history_warning: state.historyUnavailable
              ? "Cannot read the Codex conversation archive state. Refresh after the local index is available."
              : options.historyWarning || "",
          },
        });
      }
      if (u.pathname === "/api/options") {
        const query = Object.fromEntries(u.searchParams);
        seen.options.push(query);
        const result = {
          ...catalog,
          ...(options.catalogForRequest
            ? options.catalogForRequest(query, state, seen)
            : options.catalog),
        };
        if (options.beforeOptions)
          await options.beforeOptions(query, state, seen);
        if (state.optionsError)
          return route.fulfill({
            status: 500,
            json: { error: state.optionsError },
          });
        return route.fulfill({ json: result });
      }
      if (u.pathname === "/api/files") {
        seen.files.push(Object.fromEntries(u.searchParams));
        return route.fulfill({
          json: {
            files: options.projectFiles || [
              {
                path: project + "/src/cart.ts",
                relative: "src/cart.ts",
                name: "cart.ts",
                directory: false,
              },
            ],
          },
        });
      }
      if (u.pathname.endsWith("/changes")) {
        seen.changes.push(u.pathname);
        return route.fulfill({
          json: {
            changes: state.workspaceChanges,
            warning: state.workspaceWarning || "",
            pending: false,
          },
        });
      }
      if (u.pathname.endsWith("/plan")) {
        seen.plans.push(u.pathname);
        return route.fulfill({ json: { pending_plan: state.pendingPlan } });
      }
      const queueRoute = u.pathname.match(
        /^\/api\/threads\/([^/]+)\/queue(?:\/([^/]+)(\/steer)?)?$/,
      );
      if (queueRoute) {
        const [, id, itemID, steering] = queueRoute;
        if (method === "GET") {
          seen.queues.push(id);
          return route.fulfill({ json: queueSnapshot(id) });
        }
        if (method === "POST" && !itemID) {
          if (state.enqueueError)
            return route.fulfill({
              status: 409,
              json: { error: state.enqueueError },
            });
          if (
            data.request_id &&
            state.queueReceipts[id + ":" + data.request_id]
          )
            return route.fulfill({ json: queueSnapshot(id) });
          if (options.beforeEnqueue) await options.beforeEnqueue();
          const value = {
            ...data,
            id:
              "queue-" +
              seen.posts.filter((post) => post.path.endsWith("/queue")).length,
            status: "waiting",
            attachments: (data.attachments || []).map(
              (uploadID) =>
                seen.uploads.find((upload) => upload.value.id === uploadID)
                  ?.value || { id: uploadID, name: uploadID },
            ),
          };
          (state.queues[id] ||= []).push(value);
          const snapshot = queueChanged(id);
          if (data.request_id)
            state.queueReceipts[id + ":" + data.request_id] = true;
          if (options.afterEnqueue)
            await options.afterEnqueue(state, data, seen);
          if (options.abortEnqueueAfterAcceptOnce && !state.abortedEnqueue) {
            state.abortedEnqueue = true;
            return route.abort("failed");
          }
          return route.fulfill({ json: snapshot });
        }
        if (method === "POST" && itemID === "resume") {
          state.queuePaused[id] = false;
          state.queueErrors[id] = "";
          for (const item of state.queues[id] || [])
            if (item.status === "failed") item.status = "waiting";
          return route.fulfill({ json: queueChanged(id) });
        }
        const row = (state.queues[id] || []).find((item) => item.id === itemID);
        if (!row)
          return route.fulfill({
            status: 404,
            json: { error: "Queued message was not found" },
          });
        if (method === "PATCH") {
          seen.queueEdits.push({
            thread: id,
            id: itemID,
            data,
            ...(req.headers()["x-codex-owner-epoch"]
              ? { ownerEpoch: req.headers()["x-codex-owner-epoch"] }
              : {}),
          });
          if (state.queueEditError)
            return route.fulfill({
              status: 409,
              json: { error: state.queueEditError },
            });
          if (options.beforeQueueEdit)
            await options.beforeQueueEdit(state, data, seen);
          if (!["waiting", "failed"].includes(row.status || "waiting"))
            return route.fulfill({
              status: 409,
              json: { error: "This queued message is no longer editable." },
            });
          const replacement = {
            ...(row.native === true || state.live.owner?.kind === "native"
              ? row
              : {}),
            ...data,
            id: row.id,
            status: row.status || "waiting",
          };
          if (Array.isArray(data.attachments))
            replacement.attachments = data.attachments.map(
              (attachmentID) =>
                row.attachments?.find((file) => file.id === attachmentID) || {
                  id: attachmentID,
                  name: attachmentID,
                },
            );
          state.queues[id] = state.queues[id].map((item) =>
            item === row ? replacement : item,
          );
          return route.fulfill({ json: queueChanged(id) });
        }
        if (method === "POST" && steering) {
          if (state.steerError)
            return route.fulfill({
              status: 409,
              json: { error: state.steerError },
            });
          if (
            !data.expected_turn_id ||
            data.expected_turn_id !== state.live.turn_id
          )
            return route.fulfill({
              status: 409,
              json: { error: "The active turn changed. Try again." },
            });
          state.live.items.push(
            steeringItem(
              "steered-" + itemID,
              [{ type: "text", text: row.text, text_elements: [] }],
              "accepted",
              state.live.turn_id,
            ),
          );
          state.queues[id] = state.queues[id].filter((item) => item !== row);
          return route.fulfill({ json: queueChanged(id) });
        }
        if (method === "DELETE") {
          seen.queueDeletes.push({ thread: id, id: itemID });
          state.queues[id] = state.queues[id].filter((item) => item !== row);
          return route.fulfill({ json: queueChanged(id) });
        }
      }
      if (u.pathname === "/api/project-file") {
        const query = Object.fromEntries(u.searchParams);
        seen.previews.push(query);
        const root =
          state.rows.find((row) => row.id === query.thread)?.cwd || project;
        const relative = query.path.startsWith(root + "/")
          ? query.path.slice(root.length + 1)
          : query.path;
        const content =
          options.fileContents?.[relative] ??
          (relative === "测试.txt" ? "测试内容" : "export const total = 42;\n");
        if (relative === "../private.txt")
          return route.fulfill({
            status: 403,
            json: { error: "File is outside the shared project" },
          });
        if (query.raw === "1" || query.download !== undefined)
          return route.fulfill({
            contentType: "text/plain",
            body: content,
            headers:
              query.download !== undefined
                ? {
                    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.posix.basename(relative))}`,
                  }
                : {},
          });
        return route.fulfill({
          json: {
            path: relative,
            name: path.posix.basename(relative),
            content,
            mime: "text/plain; charset=utf-8",
            size: Buffer.byteLength(content),
            binary: false,
            truncated: false,
            image: false,
          },
        });
      }
      if (u.pathname === "/api/attachments" && method === "POST") {
        assert(multipart, "upload must use multipart encoding");
        const body = req.postDataBuffer().toString("utf8");
        const name = /filename="([^"]+)"/.exec(body)?.[1];
        assert(name, "multipart upload lost filename");
        assert.equal(u.searchParams.get("project"), project);
        const value = {
          id: "upload-" + (seen.uploads.length + 1),
          name,
          size: name.endsWith(".png") ? 68 : 13,
          mime: name.endsWith(".png") ? "image/png" : "text/plain",
          image: name.endsWith(".png"),
        };
        seen.uploads.push({ value, body });
        return route.fulfill({ json: value });
      }
      if (u.pathname.startsWith("/api/attachments/")) {
        if (method === "DELETE") {
          seen.deletes.push(u.pathname.split("/").at(-1));
          return route.fulfill({ status: 204 });
        }
        return route.fulfill({
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/hUAAAAASUVORK5CYII=",
            "base64",
          ),
        });
      }
      if (u.pathname === "/api/threads") {
        if (state.createError) {
          options.onCreateFailure?.(state, data, seen);
          return route.fulfill({
            status: 409,
            json: {
              error: state.createError,
              ...(state.createdThreadID !== undefined
                ? { created_thread_id: state.createdThreadID }
                : {}),
            },
          });
        }
        for (const key of ["model", "effort", "mode", "permission"])
          if (data[key] !== undefined) state.sessionOptions[key] = data[key];
        const created = options.onCreate?.(state, data, seen) || session;
        return route.fulfill({ json: created });
      }
      if (u.pathname.endsWith("/history")) {
        const cursor = u.searchParams.get("cursor");
        seen.history.push(cursor);
        return route.fulfill({
          json: options.historyPages?.[cursor] || {
            items: [],
            has_more: false,
            next_cursor: "",
          },
        });
      }
      if (/^\/api\/sessions\/[^/]+$/.test(u.pathname)) {
        seen.details.push(u.pathname);
        if (state.archivedDetail)
          return route.fulfill({
            status: 410,
            json: {
              error: "This conversation is archived in Codex.",
              archived: true,
            },
          });
        if (state.historyUnavailable || state.detailHistoryUnavailable)
          return route.fulfill({
            status: 400,
            json: {
              error:
                "Cannot read the Codex conversation archive state. Refresh after the local index is available.",
              history_unavailable: true,
            },
          });
        const row =
          state.rows.find((r) => r.id === u.pathname.split("/").at(-1)) ||
          session;
        return route.fulfill({
          json: {
            session: row,
            history: { parts: [] },
            history_items: state.historyItems,
            history_next_cursor: state.historyCursor || "",
            history_has_more: !!state.historyCursor,
            live: state.threadLives?.[row.id] || state.live,
            options: state.sessionOptions,
          },
        });
      }
      if (u.pathname.endsWith("/connect")) {
        if (options.beforeConnect)
          await options.beforeConnect(state, data, seen);
        if (state.connectError)
          return route.fulfill({
            status: 409,
            json: { error: state.connectError },
          });
        if (options.onConnect) options.onConnect(state, data, seen);
        return route.fulfill({
          json: {
            connected: true,
            ...(options.connectSnapshot ? { live: state.live } : {}),
          },
        });
      }
      if (u.pathname.endsWith("/settings")) {
        if (options.beforeSettings)
          await options.beforeSettings(state, data, seen);
        if (state.settingsError)
          return route.fulfill({
            status: 409,
            json: { error: state.settingsError },
          });
        state.sessionOptions = { ...state.sessionOptions, ...data };
        if (state.live.options)
          state.live = { ...state.live, options: { ...state.sessionOptions } };
        return route.fulfill({ json: { options: state.sessionOptions } });
      }
      if (u.pathname.endsWith("/turn")) {
        if (state.turnError)
          return route.fulfill({
            status: 409,
            json: { error: state.turnError },
          });
        if (options.beforeTurn) await options.beforeTurn();
        for (const key of ["model", "effort", "mode", "permission"])
          if (data[key] !== undefined) state.sessionOptions[key] = data[key];
        if (options.onTurn) options.onTurn(state, data, seen);
        else
          state.live = {
            status: "inProgress",
            turn_id: "turn-1",
            items: richItems(),
            requests: [],
            activity: "commandExecution",
            plan: {
              explanation: "Improve cart behavior safely.",
              plan: [
                { step: "Inspect cart", status: "completed" },
                { step: "Update cart tests", status: "inProgress" },
              ],
            },
            diff: patch("before", "final"),
          };
        return route.fulfill({ json: { turn_id: state.live.turn_id } });
      }
      if (u.pathname.endsWith("/execute-plan")) {
        if (state.executeError)
          return route.fulfill({
            status: 409,
            json: { error: state.executeError },
          });
        assert.equal(
          data.plan_id,
          state.pendingPlan?.id,
          "execution must use the currently pending plan ID",
        );
        if (options.beforeExecute) await options.beforeExecute();
        state.pendingPlan = null;
        state.sessionOptions.mode = "default";
        state.live = {
          status: "inProgress",
          turn_id: "execute-turn",
          items: [
            {
              id: "execution-start",
              type: "agentMessage",
              text: "Implementing the confirmed plan.",
            },
          ],
          requests: [],
        };
        return route.fulfill({ json: { turn_id: state.live.turn_id } });
      }
      if (u.pathname.endsWith("/steer")) {
        state.live.items.push(
          steeringItem(
            "follow-up",
            [{ type: "text", text: data.text, text_elements: [] }],
            "accepted",
            state.live.turn_id,
          ),
        );
        return route.fulfill({ json: { steered: true } });
      }
      if (u.pathname.endsWith("/answer")) {
        if (options.onAnswer) options.onAnswer(state, data, seen);
        else state.live = { ...state.live, status: "completed", requests: [] };
        return route.fulfill({ json: { answered: true } });
      }
      if (u.pathname.endsWith("/interrupt")) {
        if (options.onInterrupt) {
          const error = options.onInterrupt(state, data, seen);
          if (error) return route.fulfill({ status: 409, json: { error } });
        }
        state.live = { ...state.live, status: "interrupted", requests: [] };
        return route.fulfill({ json: { interrupt_requested: true } });
      }
      if (u.pathname === "/api/logout") {
        state.paired = false;
        return route.fulfill({ status: 204 });
      }
      seen.unknown.push(method + " " + u.pathname);
      return route.fulfill({
        status: 404,
        json: { error: "Unknown fixture API" },
      });
    }
    const name = u.pathname === "/" ? "index.html" : u.pathname.slice(1);
    if (
      !["index.html", "remote.js", "remote.css", "favicon.ico"].includes(name)
    ) {
      seen.unknown.push(name);
      return route.fulfill({ status: 404 });
    }
    if (name === "favicon.ico") return route.fulfill({ status: 204 });
    return route.fulfill({
      body: await fs.readFile(path.join(assets, name)),
      contentType: {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
      }[path.extname(name)],
      headers: {
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      },
    });
  });
  await page.goto(origin + "/#key=" + pairCode);
  await page.locator("#workspace:visible").waitFor();
  if (state.projects.length === 1 && options.waitForOptions !== false)
    await page.waitForFunction(
      () => !document.getElementById("model").disabled,
    );
  assert.equal(new URL(page.url()).hash, "");
  return {
    page,
    seen,
    state,
    origin,
    async clean() {
      assert.deepEqual(seen.errors, [], "browser errors");
      assert.deepEqual(seen.unknown, [], "unexpected network requests");
    },
  };
}

async function menu(page, control, label) {
  await page.locator("#" + control).click();
  if (control === "model") await page.locator("#reasoningModel").click();
  if (control === "effort") {
    if (label === "Default effort")
      await page.locator("#reasoningReset").click();
    else {
      const name = await page.locator("#reasoningModelName").innerText();
      const model = catalog.models.find(
        (model) => model.displayName === name || model.model === name,
      );
      const names = {
        none: "None",
        minimal: "Minimal",
        low: "Low",
        medium: "Medium",
        high: "High",
        xhigh: "Extra high",
        max: "Maximum",
        ultra: "Ultra",
      };
      const index = model?.supportedReasoningEfforts.findIndex(
        (effort) => names[effort.reasoningEffort] === label,
      );
      assert(
        index >= 0,
        "reasoning level is absent from the selected model: " + label,
      );
      await page.locator("#reasoningRange").evaluate((range, value) => {
        range.value = value;
        range.dispatchEvent(new Event("input", { bubbles: true }));
      }, String(index));
      await page.locator("#reasoningRange").dispatchEvent("change");
    }
  } else
    await page
      .locator("#menu")
      .getByRole("menuitemradio")
      .filter({ hasText: label })
      .click();
  await page.waitForFunction(
    (id) => !document.getElementById(id).disabled,
    control,
  );
  if (
    (control === "model" || control === "effort") &&
    (await page.locator("#reasoningCard").isVisible())
  )
    await page.locator("#closeReasoning").click();
}

async function screenshot(page, name) {
  if (!process.env.ARTIFACT_DIR) return;
  await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(process.env.ARTIFACT_DIR, name),
    fullPage: true,
    scale: "css",
    animations: "disabled",
  });
}

for (const engine of engines) {
  test(`${engine}: agent descriptor selects generic UI and is sent with requests`, async (t) => {
    const f = await fixture(t, engine, {
      agents: {
        agents: [{ id: "opencode", name: "OpenCode" }],
        default_agent: "opencode",
      },
      catalog: {
        agent: { id: "opencode", name: "OpenCode" },
        capabilities: { ...catalog.capabilities, background_creation: true },
      },
    });
    const { page, seen } = f;
    assert.match(
      await page.locator("#message").getAttribute("placeholder"),
      /OpenCode/,
    );
    assert.equal(await page.locator("#openCodex").isVisible(), false);
    const created = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/threads",
    );
    await page.locator("#new").click();
    await created;
    assert(
      seen.agentHeaders.some(
        (header) =>
          header.path === "/api/threads" && header.agent === "opencode",
      ),
    );
    await f.clean();
  });

  test(`${engine}: failed agent discovery cannot authorize a Codex task`, async (t) => {
    const f = await fixture(t, engine, {
      agents: { agents: [], default_agent: "unverified" },
      waitForOptions: false,
    });
    await f.page.waitForFunction(() =>
      document
        .getElementById("notice")
        .textContent.includes("could not be verified"),
    );
    assert.equal(await f.page.locator("#new").isDisabled(), true);
    assert.equal(await f.page.locator("#send").isDisabled(), true);
    assert.equal(
      f.seen.posts.filter((post) => post.path === "/api/threads").length,
      0,
    );
    await f.clean();
  });

  test(`${engine}: changing agents clears reused conversation IDs and keeps drafts isolated`, async (t) => {
    let next = "codex";
    const f = await fixture(t, engine, {
      agents: () => ({
        agents: [{ id: next, name: next === "codex" ? "Codex" : "OpenCode" }],
        default_agent: next,
      }),
      catalog: {
        capabilities: { ...catalog.capabilities, background_creation: true },
      },
    });
    const { page, seen, state } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.locator("#message").fill("Keep this only for Codex.");
    state.online = false;
    await page.evaluate(() => document.getElementById("retryDevice").click());
    await page.locator("#deviceOffline:visible").waitFor();
    next = "opencode";
    state.online = true;
    const oldAgentHeaders = seen.agentHeaders.length;
    await page.evaluate(() => document.getElementById("retryDevice").click());
    await page.waitForFunction(() =>
      document.getElementById("message").placeholder.includes("OpenCode"),
    );
    assert.equal(await page.locator("#message").inputValue(), "");
    assert.equal(await page.locator("#title").innerText(), "New session");
    assert.equal(await page.locator("#openCodex").isVisible(), false);
    assert.equal(
      seen.agentHeaders.slice(oldAgentHeaders).filter((header) =>
        header.path.includes("/remote-rich/"),
      ).length,
      0,
    );
    await page.locator("#message").fill("Send only to OpenCode.");
    await page.locator("#send").click();
    await page.waitForFunction(
      () => document.getElementById("message").value === "",
    );
    const turn = seen.agentHeaders.find((header) =>
      header.path.endsWith("/turn"),
    );
    assert.equal(turn?.agent, "opencode");
    assert.equal(
      seen.posts.find((post) => post.path.endsWith("/turn"))?.data.text,
      "Send only to OpenCode.",
    );
    await f.clean();
  });

  test(`${engine}: React glass appearance persists without replacing a conversation or its draft`, async (t) => {
    const f = await fixture(t, engine, {
      locale: "zh-CN",
      state: { historyItems: richItems() },
    });
    const { page, seen } = f;
    const cspErrors = [];
    page.on("console", (message) => {
      if (/Content Security Policy|violates.*directive/i.test(message.text()))
        cspErrors.push(message.text());
    });
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.locator("#history .markdown h1").waitFor();
    await page.locator("#message").fill("主题切换后保留的草稿");
    assert(
      await page
        .locator("html")
        .evaluate((node) => node.classList.contains("dark")),
    );
    await page.locator("#changesToggle").click();
    await page.locator("#workspace .theme-toggle").click();
    assert.equal(
      await page.locator("#message").inputValue(),
      "主题切换后保留的草稿",
    );
    assert.equal(await page.locator("#title").innerText(), "Build checkout");
    assert.equal(
      await page
        .locator("html")
        .evaluate((node) => node.classList.contains("dark")),
      false,
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("codex.remote.theme")),
      "light",
    );
    assert.equal(
      seen.posts.filter((post) => /\/(turn|queue|settings)$/.test(post.path))
        .length,
      0,
      "changing appearance must not send a task or settings",
    );
    await page.reload();
    await page.locator("#workspace:visible").waitFor();
    assert.equal(
      await page
        .locator("html")
        .evaluate((node) => node.classList.contains("dark")),
      false,
    );
    assert.deepEqual(
      cspErrors,
      [],
      "application interactions must respect CSP",
    );
    // WebKit screenshots inject an inline animation-sync style, so capture after CSP assertions.
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.locator("#history .markdown h1").waitFor();
    await page.locator("#message").fill("主题切换后保留的草稿");
    await page.locator("#changesToggle").click();
    await screenshot(page, `react-workspace-light-${engine}.png`);
    await page.locator("#workspace .theme-toggle").click();
    await screenshot(page, `react-workspace-dark-${engine}.png`);
    await f.clean();
  });
  test(`${engine}: mobile fields keep readable text and stable viewport on focus in every supported language`, async (t) => {
    for (const locale of ["en-US", "zh-CN", "zh-TW", "ja-JP", "de-DE"])
      await t.test(locale, async (t) => {
        const f = await fixture(t, engine, {
          width: 390,
          height: 844,
          locale,
          mobile: true,
        });
        const { page, seen } = f;
        const [searchName, fileName] = {
          "en-US": ["Search conversations", "Find a file"],
          "zh-CN": ["搜索会话", "搜索文件"],
          "zh-TW": ["搜尋對話", "搜尋檔案"],
          "ja-JP": ["チャットを検索", "ファイルを検索"],
          "de-DE": ["Unterhaltungen suchen", "Datei suchen"],
        }[locale];
        await page.locator("#sidebarToggle").click();
        assert.equal(
          await page
            .getByRole("searchbox", { name: searchName, exact: true })
            .count(),
          1,
          "conversation search needs its localized accessible name",
        );
        await page.locator('#sessions button[data-id="remote-rich"]').click();
        const viewport = await page
          .locator('meta[name="viewport"]')
          .getAttribute("content");
        assert.match(viewport, /width=device-width/);
        assert(
          !/user-scalable\s*=\s*no|maximum-scale\s*=/i.test(viewport),
          "browser zoom must remain available",
        );
        const fields = await page
          .locator('input:not([type="file"]), textarea')
          .evaluateAll((fields) =>
            fields
              .filter((field) => !["radio", "checkbox"].includes(field.type))
              .map((field) => ({
                id: field.id,
                font: parseFloat(getComputedStyle(field).fontSize),
              })),
          );
        assert(fields.length >= 6);
        assert(
          fields.every((field) => field.font >= 16),
          "a field would trigger Safari focus zoom: " + JSON.stringify(fields),
        );
        const stableFocus = async (selector) => {
          const before = await page.evaluate(() => ({
            width: innerWidth,
            scale: visualViewport?.scale || 1,
          }));
          await page.locator(selector).focus();
          const after = await page.evaluate(() => ({
            width: innerWidth,
            scale: visualViewport?.scale || 1,
            overflow: document.documentElement.scrollWidth > innerWidth,
            pageY: scrollY,
          }));
          assert.equal(after.width, before.width);
          assert.equal(after.scale, before.scale);
          assert.equal(
            after.overflow,
            false,
            "focused field made the page overflow",
          );
          assert.equal(after.pageY, 0, "focused field moved the entire page");
        };
        for (const width of [320, 390, 760]) {
          await page.setViewportSize({ width, height: 844 });
          await stableFocus("#message");
          await page.locator("#message").fill("Draft stays here · 保留输入");
          const layout = await page
            .locator("#composer")
            .evaluate((composer) => {
              const bounds = composer.getBoundingClientRect();
              return {
                left: bounds.left,
                right: bounds.right,
                bottom: bounds.bottom,
                width: innerWidth,
                height: innerHeight,
                toolbarOverflow: composer.scrollWidth > composer.clientWidth,
              };
            });
          assert(
            layout.left >= 0 &&
              layout.right <= layout.width + 1 &&
              layout.bottom <= layout.height + 1 &&
              !layout.toolbarOverflow,
            "composer controls overflow: " + JSON.stringify(layout),
          );
          const header = await page
            .locator(".conversation-heading")
            .evaluate((heading) => {
              const row = heading.getBoundingClientRect(),
                title = document
                  .getElementById("title")
                  .getBoundingClientRect();
              return {
                top: row.top,
                bottom: row.bottom,
                titleTop: title.top,
                titleBottom: title.bottom,
                overflow: heading.scrollWidth > heading.clientWidth,
              };
            });
          assert(
            header.titleTop >= header.top &&
              header.titleBottom <= header.bottom &&
              !header.overflow,
            "mobile title leaves its header: " + JSON.stringify(header),
          );
          await page.locator("#sidebarToggle").click();
          await stableFocus("#search");
          await page.keyboard.press("Escape");
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator("#filesToggle").click();
        assert.equal(
          await page
            .getByRole("searchbox", { name: fileName, exact: true })
            .count(),
          1,
          "file search needs its localized accessible name",
        );
        await stableFocus("#filesSearch");
        await page.locator("#closeChanges").click();
        assert.equal(
          await page.locator("#message").inputValue(),
          "Draft stays here · 保留输入",
        );
        await page.locator("#model").click();
        await page.locator("#reasoningCard:visible").waitFor();
        await page.setViewportSize({ width: 390, height: 540 });
        await page.waitForFunction(() => {
          const card = document.getElementById("reasoningCard"),
            rect = card.getBoundingClientRect();
          return (
            !card.hidden &&
            rect.left >= 0 &&
            rect.right <= innerWidth + 1 &&
            rect.top >= 0 &&
            rect.bottom <= innerHeight + 1
          );
        });
        assert(
          await page.locator("#reasoningCard").isVisible(),
          "keyboard viewport change closed the reasoning controls",
        );
        const resizedCard = await page
          .locator("#reasoningCard")
          .evaluate((card) => {
            const rect = card.getBoundingClientRect();
            return {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              width: innerWidth,
              height: innerHeight,
              overflow: card.scrollWidth > card.clientWidth,
            };
          });
        assert(
          resizedCard.left >= 0 &&
            resizedCard.right <= resizedCard.width + 1 &&
            resizedCard.top >= 0 &&
            resizedCard.bottom <= resizedCard.height + 1 &&
            !resizedCard.overflow,
          "reasoning card left the resized phone viewport: " +
            JSON.stringify(resizedCard),
        );
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator("#closeReasoning").click();
        assert.equal(
          seen.posts.filter(
            (post) =>
              post.path === "/api/threads" || post.path.endsWith("/turn"),
          ).length,
          0,
          "focusing fields must not submit a task",
        );
        await screenshot(
          page,
          `workspace-refined-mobile-${engine}-${locale}.png`,
        );
        await f.clean();
      });
  });
  test(`${engine}: reasoning slider previews locally and saves one owner-confirmed level without losing drafts`, async (t) => {
    const owner = {
      kind: "native",
      state: "connected",
      epoch: "slider-owner",
      capabilities: { send: true, configure: true },
    };
    const f = await fixture(t, engine, {
      streaming: true,
      rows: [{ ...session, source: "codex-app" }],
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: { live: { status: "idle", items: [], requests: [], owner } },
    });
    const { page, state, seen } = f;
    const settings = () =>
      seen.posts.filter((post) => post.path.endsWith("/settings"));
    await page.locator("#sessions button").click();
    await page
      .locator("#message")
      .fill("Keep this draft while choosing reasoning.");
    await page.locator("#effort").click();
    await page.locator('#reasoningCard[role="dialog"]:visible').waitFor();
    const range = page.locator("#reasoningRange");
    assert.equal(await range.getAttribute("min"), "0");
    assert.equal(await range.getAttribute("max"), "1");
    assert.equal(await range.getAttribute("step"), "1");
    assert.equal(await range.inputValue(), "0");
    assert.equal(await range.getAttribute("aria-valuetext"), "Medium");
    assert.equal(
      await range.evaluate((range) =>
        range.style.getPropertyValue("--progress"),
      ),
      "0%",
    );
    await range.evaluate((range) => {
      range.value = "1";
      range.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.equal(await page.locator("#reasoningLabel").innerText(), "High");
    assert.equal(
      await page.locator("#reasoningDescription").innerText(),
      "More reasoning",
    );
    assert.equal(
      await range.evaluate((range) =>
        range.style.getPropertyValue("--progress"),
      ),
      "100%",
    );
    assert.equal(
      settings().length,
      0,
      "drag preview changed the actual conversation settings",
    );
    assert.match(
      await page.locator("#effort").innerText(),
      /Medium/,
      "preview was presented as saved",
    );
    await screenshot(page, `workspace-reasoning-${engine}-1440.png`);
    await range.dispatchEvent("change");
    await page.waitForFunction(
      () => !document.getElementById("effort").disabled,
    );
    assert.deepEqual(settings(), [
      {
        path: "/api/threads/remote-rich/settings",
        data: { effort: "high" },
        ownerEpoch: owner.epoch,
      },
    ]);
    assert.equal(await range.inputValue(), "1");
    state.settingsError = "The original owner rejected this reasoning level.";
    await range.evaluate((range) => {
      range.value = "0";
      range.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await range.dispatchEvent("change");
    await page
      .locator("#notice")
      .filter({ hasText: "rejected this reasoning level" })
      .waitFor();
    await page.waitForFunction(
      () => !document.getElementById("effort").disabled,
    );
    assert.equal(
      await range.inputValue(),
      "1",
      "a rejected change left the slider on an unsaved level",
    );
    assert.equal(await page.locator("#reasoningLabel").innerText(), "High");
    assert.match(await page.locator("#effort").innerText(), /High/);
    assert.equal(
      settings().length,
      2,
      "a rejected reasoning change was retried",
    );
    state.settingsError = "";
    await page.locator("#reasoningModel").click();
    await page
      .locator("#menu")
      .getByRole("menuitemradio")
      .filter({ hasText: "Codex Fast" })
      .click();
    await page.waitForFunction(
      () => !document.getElementById("effort").disabled,
    );
    assert.deepEqual(settings().at(-1), {
      path: "/api/threads/remote-rich/settings",
      data: { model: "codex-fast", effort: "low" },
      ownerEpoch: owner.epoch,
    });
    assert.equal(
      await range.inputValue(),
      "0",
      "model change retained an index from the previous model",
    );
    assert.equal(await range.getAttribute("aria-valuetext"), "Low");
    assert.equal(
      await page.locator("#reasoningDescription").innerText(),
      "Quick reasoning",
    );
    const before = settings().length;
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [],
        state: {
          owner: {
            kind: "native",
            state: "observing",
            epoch: "replacement-slider-owner",
            capabilities: { configure: false },
          },
        },
      }),
    );
    await page.locator("#reasoningCard").waitFor({ state: "hidden" });
    assert(await page.locator("#effort").isDisabled());
    await range.evaluate((range) => {
      range.value = "1";
      range.dispatchEvent(new Event("input", { bubbles: true }));
      range.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.equal(
      settings().length,
      before,
      "an old slider bypassed the replacement owner capabilities",
    );
    assert.equal(
      await page.locator("#message").inputValue(),
      "Keep this draft while choosing reasoning.",
    );
    await f.clean();
  });

  test(`${engine}: reasoning slider keyboard uses only the selected model levels and reset restores its default`, async (t) => {
    const owner = {
      kind: "background",
      state: "connected",
      epoch: "keyboard-slider-owner",
      capabilities: { send: true, configure: true },
    };
    const f = await fixture(t, engine, {
      streaming: true,
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: { live: { status: "idle", items: [], requests: [], owner } },
    });
    const { page, seen } = f;
    await page.locator("#sessions button").click();
    await page.locator("#model").click();
    const range = page.locator("#reasoningRange");
    await range.focus();
    for (const [key, value, effort] of [
      ["End", "1", "high"],
      ["Home", "0", "medium"],
      ["ArrowRight", "1", "high"],
      ["ArrowLeft", "0", "medium"],
    ]) {
      const before = seen.posts.filter((post) =>
        post.path.endsWith("/settings"),
      ).length;
      await page.keyboard.press(key);
      await page.waitForFunction(
        () => !document.getElementById("effort").disabled,
      );
      const settings = seen.posts.filter((post) =>
        post.path.endsWith("/settings"),
      );
      assert.equal(
        settings.length,
        before + 1,
        key + " did not save exactly one selected level",
      );
      assert.equal(await range.inputValue(), value);
      assert.deepEqual(settings.at(-1).data, { effort });
      assert.equal(settings.at(-1).ownerEpoch, owner.epoch);
      await range.focus();
    }
    await page.keyboard.press("End");
    await page.waitForFunction(
      () => !document.getElementById("effort").disabled,
    );
    await page.locator("#reasoningReset").click();
    await page.waitForFunction(
      () => !document.getElementById("effort").disabled,
    );
    assert.equal(await range.inputValue(), "0");
    assert.equal(await range.getAttribute("aria-valuetext"), "Medium");
    assert.deepEqual(
      seen.posts.filter((post) => post.path.endsWith("/settings")).at(-1).data,
      { effort: "medium" },
    );
    await page.keyboard.press("Escape");
    assert(await page.locator("#reasoningCard").isHidden());
    await f.clean();
  });

  test(`${engine}: absent and single reasoning levels cannot produce an unadvertised setting`, async (t) => {
    for (const levels of [
      [],
      [{ reasoningEffort: "high", description: "The only supported level" }],
    ])
      await t.test(String(levels.length) + " supported levels", async (t) => {
        const model = {
          ...catalog.models[0],
          supportedReasoningEfforts: levels,
          defaultReasoningEffort: levels[0]?.reasoningEffort || "",
        };
        const f = await fixture(t, engine, {
          catalog: {
            models: [model],
            defaults: { ...defaults, effort: model.defaultReasoningEffort },
          },
        });
        const { page, seen } = f;
        await page.locator("#model").click();
        const range = page.locator("#reasoningRange");
        assert(await range.isDisabled());
        assert.equal(await range.getAttribute("max"), "0");
        if (levels.length) {
          assert.equal(
            await page.locator("#reasoningLabel").innerText(),
            "High",
          );
          assert.equal(
            await page.locator("#reasoningDescription").innerText(),
            levels[0].description,
          );
        }
        await range.evaluate((range) => {
          range.value = "1";
          range.dispatchEvent(new Event("input", { bubbles: true }));
          range.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await page.locator("#closeReasoning").click();
        await page.locator("#message").fill("Use only advertised settings.");
        await page.locator("#send").click();
        await page.locator("#live .command").waitFor({ state: "attached" });
        const creation = seen.posts.find(
          (post) => post.path === "/api/threads",
        );
        assert(
          creation.data.effort === undefined ||
            levels.some(
              (level) => level.reasoningEffort === creation.data.effort,
            ),
          "disabled slider invented a reasoning setting",
        );
        await f.clean();
      });
  });

  test(`${engine}: an explicit unknown model never borrows another model reasoning levels`, async (t) => {
    const owner = {
      kind: "native",
      state: "connected",
      epoch: "unknown-model-owner",
      capabilities: { send: true, configure: true },
    };
    const f = await fixture(t, engine, {
      streaming: true,
      rows: [{ ...session, source: "codex-app" }],
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        sessionOptions: { ...defaults, model: "custom-model", effort: "xhigh" },
        live: { status: "idle", items: [], requests: [], owner },
      },
    });
    const { page, seen } = f;
    await page.locator("#sessions button").click();
    await page.locator("#model").click();
    assert.equal(
      await page.locator("#reasoningModelName").innerText(),
      "custom-model",
    );
    assert.equal(
      await page.locator("#reasoningLabel").innerText(),
      "Extra high",
    );
    assert.equal(
      await page.locator("#reasoningRange").getAttribute("max"),
      "0",
    );
    assert(await page.locator("#reasoningRange").isDisabled());
    assert(await page.locator("#reasoningReset").isDisabled());
    await page.locator("#reasoningRange").dispatchEvent("change");
    await page.locator("#reasoningReset").dispatchEvent("click");
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/settings")).length,
      0,
      "unknown model inherited a different model effort",
    );
    await page.locator("#reasoningModel").click();
    await page
      .locator("#menu")
      .getByRole("menuitemradio")
      .filter({ hasText: "Codex Fast" })
      .click();
    await page.waitForFunction(
      () => !document.getElementById("effort").disabled,
    );
    assert.equal(
      await page.locator("#reasoningModelName").innerText(),
      "Codex Fast",
    );
    assert.equal(
      await page.locator("#reasoningRange").getAttribute("max"),
      "1",
    );
    assert(await page.locator("#reasoningRange").isEnabled());
    assert.deepEqual(
      seen.posts.find((post) => post.path.endsWith("/settings")),
      {
        path: "/api/threads/remote-rich/settings",
        data: { model: "codex-fast", effort: "low" },
        ownerEpoch: owner.epoch,
      },
    );
    await f.clean();
  });

  test(`${engine}: native settings synchronize through details and streaming without replacing drafts`, async (t) => {
    const owner = {
      kind: "native",
      state: "connected",
      epoch: "settings-owner",
      capabilities: { send: true, queue: true, steer: true, configure: true },
    };
    const f = await fixture(t, engine, {
      streaming: true,
      rows: [{ ...session, source: "codex-app" }],
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: { live: { status: "idle", items: [], requests: [], owner } },
    });
    const { page, state, seen } = f;
    await page.locator("#sessions button").click();
    await page.locator("#message").fill("Preserve this unsent draft.");
    state.sessionOptions = {
      ...defaults,
      model: "codex-fast",
      effort: "high",
      permission: "full-access",
      mode: "plan",
    };
    await page.locator("#refresh").click();
    await page.locator("#model").filter({ hasText: "Codex Fast" }).waitFor();
    assert.match(await page.locator("#permission").innerText(), /Full access/);
    assert.match(await page.locator("#mode").innerText(), /Plan mode/);
    await page.evaluate(
      (options) =>
        window.fixtureStreams.at(-1).emit({ items: [], state: { options } }),
      { ...defaults, permission: "read-only" },
    );
    await page
      .locator("#permission")
      .filter({ hasText: "Read only" })
      .waitFor();
    assert.match(await page.locator("#model").innerText(), /Codex Main/);
    assert.match(await page.locator("#mode").innerText(), /Default mode/);
    assert.equal(
      await page.locator("#message").inputValue(),
      "Preserve this unsent draft.",
    );
    await menu(page, "permission", "Ask for approval");
    assert.deepEqual(
      seen.posts.find((post) => post.path.endsWith("/settings")),
      {
        path: "/api/threads/remote-rich/settings",
        data: { permission: "workspace-write" },
        ownerEpoch: "settings-owner",
      },
    );
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/turn")).length,
      0,
      "changing settings started an unwanted turn",
    );
    await f.clean();
  });

  test(`${engine}: settings wait for owner confirmation and rejected edits preserve canonical permissions and draft`, async (t) => {
    const owner = {
      kind: "native",
      state: "connected",
      epoch: "pending-settings-owner",
      capabilities: { send: true, configure: true },
    };
    let releaseSettings;
    const pending = new Promise((resolve) => {
      releaseSettings = resolve;
    });
    const f = await fixture(t, engine, {
      rows: [{ ...session, source: "codex-app" }],
      beforeSettings: () => pending,
      state: {
        live: { status: "idle", items: [], requests: [], owner },
        settingsError:
          "The original application rejected this permission mode.",
      },
    });
    const { page, seen } = f;
    t.after(() => releaseSettings());
    await page.locator("#sessions button").click();
    await page.locator("#message").fill("Retain me if saving fails.");
    await page.locator("#permission").click();
    await page
      .locator("#menu")
      .getByText("Approve for me", { exact: true })
      .click();
    await page
      .locator("#composerHint")
      .filter({ hasText: "Saving settings…" })
      .waitFor();
    assert.match(
      await page.locator("#permission").innerText(),
      /Ask for approval/,
      "permission changed before owner confirmation",
    );
    assert(await page.locator("#send").isDisabled());
    assert(await page.locator("#model").isDisabled());
    await page.locator("#composer").dispatchEvent("submit");
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/turn")).length,
      0,
    );
    releaseSettings();
    await page
      .locator("#notice")
      .filter({ hasText: "rejected this permission" })
      .waitFor();
    assert.match(
      await page.locator("#permission").innerText(),
      /Ask for approval/,
    );
    assert.equal(
      await page.locator("#message").inputValue(),
      "Retain me if saving fails.",
    );
    assert(await page.locator("#send").isEnabled());
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/settings")).length,
      1,
      "a rejected settings update was retried automatically",
    );
    await f.clean();
  });

  test(`${engine}: background creation acquires its owner before first send and never falls back on failure`, async (t) => {
    const owner = {
      kind: "background",
      state: "connected",
      epoch: "created-background-owner",
      capabilities: { send: true, queue: true, configure: true },
    };
    const f = await fixture(t, engine, {
      streaming: true,
      catalog: {
        capabilities: {
          ...catalog.capabilities,
          background_creation: true,
          streaming: true,
        },
      },
      onCreate(state) {
        const row = { ...session, source: "remote" };
        state.rows = [row];
        state.live = { status: "idle", items: [], requests: [], owner };
        return row;
      },
    });
    const { page, seen } = f;
    await page.locator("#message").fill("Create once in the original app.");
    await page.locator("#send").click();
    await page.locator("#sourceBadge").filter({ hasText: "Remote" }).waitFor();
    await page.waitForFunction(
      () => document.getElementById("message").value === "",
    );
    const creation = seen.posts.find((post) => post.path === "/api/threads"),
      turn = seen.posts.find((post) => post.path.endsWith("/turn"));
    assert.equal(creation.data.executor, "background");
    assert.equal(turn.ownerEpoch, "created-background-owner");
    assert.equal(
      seen.posts.filter((post) => post.path === "/api/threads").length,
      1,
    );
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/connect")).length,
      0,
    );
    await f.clean();
    const failed = await fixture(t, engine, {
      catalog: {
        capabilities: { ...catalog.capabilities, background_creation: true },
      },
      state: { createError: "Codex App could not load the new conversation." },
    });
    await failed.page
      .locator("#message")
      .fill("Keep my draft after creation fails.");
    await failed.page.locator("#send").click();
    await failed.page
      .locator("#notice")
      .filter({ hasText: "could not load" })
      .waitFor();
    assert.equal(
      failed.seen.posts.filter((post) => post.path === "/api/threads").length,
      1,
      "failed background creation fell back to another executor",
    );
    assert.equal(
      failed.seen.posts.filter((post) => post.path.endsWith("/turn")).length,
      0,
    );
    assert.equal(
      await failed.page.locator("#message").inputValue(),
      "Keep my draft after creation fails.",
    );
    await failed.clean();
  });

  test(`${engine}: partial background creation keeps its returned thread and draft for one explicit continuation`, async (t) => {
    for (const control of ["send", "new"]) {
      const owner = {
        kind: "native",
        state: "connected",
        epoch: "recovered-native-owner",
        capabilities: { send: true, configure: true },
      };
      const created = {
        ...session,
        id: "created-native-recovery",
        source: "codex-app",
      };
      const f = await fixture(t, engine, {
        state: {
          createError: "Codex App is still loading this created conversation.",
          createdThreadID: created.id,
        },
        onCreateFailure(state) {
          state.rows = [created];
          state.live = { status: "idle", items: [], requests: [], owner };
        },
      });
      const { page, seen } = f;
      await page
        .locator("#message")
        .fill("Keep this draft while the original app connects.");
      await page
        .locator("#fileInput")
        .setInputFiles({
          name: "draft.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("attached draft"),
        });
      await page.locator("#attachments .attachment-chip").waitFor();
      await page.locator("#" + control).click();
      await page
        .locator("#notice")
        .filter({ hasText: "still loading this created conversation" })
        .waitFor();
      assert.equal(
        seen.posts.filter((post) => post.path === "/api/threads").length,
        1,
      );
      assert.equal(
        seen.posts.filter((post) => post.path.endsWith("/turn")).length,
        0,
        "partial creation automatically sent the retained draft",
      );
      assert.equal(
        await page.locator("#message").inputValue(),
        "Keep this draft while the original app connects.",
      );
      assert.equal(
        await page.locator("#attachments .attachment-chip").count(),
        1,
      );
      assert.deepEqual(seen.deletes, []);
      assert(
        seen.details.includes("/api/sessions/" + created.id),
        "partial result did not refresh its actual owner",
      );
      assert.deepEqual(seen.options.at(-1), { project, thread: created.id });
      await page.locator("#send").click();
      await page.locator("#live .command").waitFor({ state: "attached" });
      assert.equal(
        seen.posts.filter((post) => post.path === "/api/threads").length,
        1,
        "explicit retry created a second conversation",
      );
      assert.deepEqual(
        seen.posts.find((post) => post.path.endsWith("/turn")),
        {
          path: "/api/threads/" + created.id + "/turn",
          data: {
            text: "Keep this draft while the original app connects.",
            attachments: ["upload-1"],
          },
          ownerEpoch: owner.epoch,
        },
      );
      await f.clean();
    }
  });

  test(`${engine}: malformed partial creation IDs never become session paths`, async (t) => {
    const f = await fixture(t, engine, {
      state: {
        createError: "The app could not create the conversation.",
        createdThreadID: "../../private",
      },
    });
    const { page, seen } = f;
    await page.locator("#message").fill("Retain this failed draft.");
    await page.locator("#send").click();
    await page
      .locator("#notice")
      .filter({ hasText: "could not create" })
      .waitFor();
    assert.deepEqual(seen.details, []);
    assert.equal(
      await page.locator("#message").inputValue(),
      "Retain this failed draft.",
    );
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/turn")).length,
      0,
    );
    await f.clean();
  });

  test(`${engine}: unavailable background creation blocks new tasks with localized app instructions`, async (t) => {
    const notices = {
      "en-US":
        "Background conversations are unavailable. Update agentTools on your computer and reconnect.",
      "zh-CN": "后台会话暂不可用，请更新电脑上的 agentTools 后重新连接。",
      "zh-TW": "背景對話暫時無法使用，請更新電腦上的 agentTools 後重新連線。",
      "ja-JP":
        "バックグラウンドの会話を利用できません。パソコンの agentTools を更新して再接続してください。",
      "de-DE":
        "Hintergrund-Unterhaltungen sind nicht verfügbar. Aktualisiere agentTools auf deinem Computer und verbinde dich erneut.",
    };
    for (const [locale, notice] of Object.entries(notices)) {
      const f = await fixture(t, engine, {
        locale,
        catalog: {
          capabilities: {
            ...catalog.capabilities,
            background_creation: false,
            native_creation: true,
          },
        },
      });
      const { page, seen } = f;
      await page
        .locator("#message")
        .fill("Wait until the original app can create this.");
      assert(await page.locator("#send").isEnabled());
      assert.equal(await page.locator("#composerHint").innerText(), notice);
      await page.locator("#send").click();
      await page.locator("#notice").filter({ hasText: notice }).waitFor();
      await page.locator("#new").click();
      await page.locator("#notice").filter({ hasText: notice }).waitFor();
      assert.equal(
        seen.posts.filter((post) => post.path === "/api/threads").length,
        0,
      );
      assert.equal(
        await page.locator("#message").inputValue(),
        "Wait until the original app can create this.",
      );
      await f.clean();
    }
  });

  test(`${engine}: background creation waits for a fresh capability while initial options are pending`, async (t) => {
    let releaseInitial, releaseFresh, startedFresh;
    const initial = new Promise((resolve) => {
        releaseInitial = resolve;
      }),
      fresh = new Promise((resolve) => {
        releaseFresh = resolve;
      }),
      freshStarted = new Promise((resolve) => {
        startedFresh = resolve;
      });
    const f = await fixture(t, engine, {
      waitForOptions: false,
      catalogForRequest(_query, _state, seen) {
        return {
          capabilities: {
            ...catalog.capabilities,
            background_creation: seen.options.length !== 1,
          },
        };
      },
      beforeOptions(_query, _state, seen) {
        if (seen.options.length === 1) return initial;
        if (seen.options.length === 2) {
          startedFresh();
          return fresh;
        }
      },
    });
    const { page, seen } = f;
    await page.locator("#composer:visible").waitFor();
    assert(
      !/unavailable/.test(await page.locator("#composerHint").innerText()),
      "pending options were reported as unavailable",
    );
    await page.locator("#message").fill("Wait for the current capability.");
    await page.locator("#new").click();
    await freshStarted;
    assert.equal(
      seen.posts.filter((post) => post.path === "/api/threads").length,
      0,
      "created before fresh options completed",
    );
    assert.equal(
      await page.locator("#message").inputValue(),
      "Wait for the current capability.",
    );
    const created = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/threads",
    );
    releaseFresh();
    await created;
    releaseInitial();
    await page.waitForFunction(() => !document.getElementById("new").disabled);
    assert.equal(
      seen.posts.filter((post) => post.path === "/api/threads").length,
      1,
    );
    assert.equal(
      seen.posts.find((post) => post.path === "/api/threads").data.executor,
      "background",
    );
    assert(
      !/unavailable/.test(await page.locator("#composerHint").innerText()),
      "stale initial result replaced fresh options",
    );
    await f.clean();
  });

  test(`${engine}: sending refreshes cached unavailable background creation and preserves explicit draft settings`, async (t) => {
    const owner = {
      kind: "native",
      state: "connected",
      epoch: "fresh-native-owner",
      capabilities: { send: true, configure: true },
    };
    let releaseFresh, startedFresh;
    const pending = new Promise((resolve) => {
        releaseFresh = resolve;
      }),
      freshStarted = new Promise((resolve) => {
        startedFresh = resolve;
      });
    const f = await fixture(t, engine, {
      catalogForRequest(_query, state) {
        return {
          capabilities: {
            ...catalog.capabilities,
            background_creation: !!state.nativeReady,
          },
        };
      },
      beforeOptions(_query, _state, seen) {
        if (seen.options.length === 2) {
          startedFresh();
          return pending;
        }
      },
      onCreate(state) {
        state.live = { status: "idle", items: [], requests: [], owner };
        return { ...session, source: "codex-app" };
      },
    });
    const { page, seen, state } = f;
    await menu(page, "model", "Codex Fast");
    await menu(page, "effort", "High");
    await menu(page, "mode", "Plan mode");
    await menu(page, "permission", "Ask for approval");
    await page
      .locator("#message")
      .fill("Keep my draft until fresh background creation is ready.");
    await page
      .locator("#fileInput")
      .setInputFiles({
        name: "draft.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("attached draft"),
      });
    await page.locator("#attachments .attachment-chip").waitFor();
    state.nativeReady = true;
    await page.locator("#send").click();
    await freshStarted;
    assert.equal(
      seen.posts.filter((post) => post.path === "/api/threads").length,
      0,
    );
    assert.equal(
      await page.locator("#attachments .attachment-chip").count(),
      1,
    );
    assert.match(await page.locator("#model").innerText(), /Codex Fast/);
    releaseFresh();
    await page.locator("#live .command").waitFor({ state: "attached" });
    assert.deepEqual(
      seen.posts.find((post) => post.path === "/api/threads").data,
      {
        project,
        model: "codex-fast",
        effort: "high",
        mode: "plan",
        permission: "workspace-write",
        executor: "background",
      },
    );
    assert.deepEqual(
      seen.posts.find((post) => post.path.endsWith("/turn")).data,
      {
        text: "Keep my draft until fresh background creation is ready.",
        attachments: ["upload-1"],
      },
    );
    assert.equal(
      seen.posts.filter((post) => post.path === "/api/threads").length,
      1,
    );
    assert.deepEqual(seen.deletes, []);
    await f.clean();
  });

  test(`${engine}: unavailable or failed fresh background options never create or discard a draft`, async (t) => {
    for (const failure of ["unavailable", "failed"])
      for (const control of ["send", "new"]) {
        const f = await fixture(t, engine, {
          catalogForRequest(_query, state) {
            return {
              capabilities: {
                ...catalog.capabilities,
                background_creation: state.nativeReady !== false,
              },
            };
          },
        });
        const { page, seen, state } = f;
        await menu(page, "model", "Codex Fast");
        await menu(page, "effort", "High");
        await menu(page, "mode", "Plan mode");
        await page
          .locator("#message")
          .fill("Retain this draft and attachment.");
        await page
          .locator("#fileInput")
          .setInputFiles({
            name: "draft.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("attached draft"),
          });
        await page.locator("#attachments .attachment-chip").waitFor();
        if (failure === "failed")
          state.optionsError = "Options temporarily unavailable.";
        else state.nativeReady = false;
        await page.locator("#" + control).click();
        await page
          .locator("#notice")
          .filter({
            hasText:
              failure === "failed"
                ? "Options temporarily unavailable."
                : "Background conversations are unavailable.",
          })
          .waitFor();
        assert.equal(seen.options.length, 2);
        assert.equal(
          seen.posts.filter(
            (post) =>
              post.path === "/api/threads" || post.path.endsWith("/turn"),
          ).length,
          0,
          "fresh options failure posted a task",
        );
        assert.equal(
          await page.locator("#message").inputValue(),
          "Retain this draft and attachment.",
        );
        assert.equal(
          await page.locator("#attachments .attachment-chip").count(),
          1,
        );
        assert.deepEqual(seen.deletes, []);
        assert.match(await page.locator("#model").innerText(), /Codex Fast/);
        assert.match(await page.locator("#effort").innerText(), /High/);
        assert.match(await page.locator("#mode").innerText(), /Plan mode/);
        await f.clean();
      }
  });

  test(`${engine}: explicit refresh and online recovery reload background options without periodic catalog polling`, async (t) => {
    const f = await fixture(t, engine, {
      clock: true,
      catalogForRequest(_query, state) {
        return {
          capabilities: {
            ...catalog.capabilities,
            background_creation: !!state.nativeReady,
          },
        };
      },
    });
    const { page, seen, state } = f;
    await page.locator("#message").fill("Retain the draft across recovery.");
    await menu(page, "model", "Codex Fast");
    state.nativeReady = true;
    await page.locator("#refresh").click();
    await page.waitForFunction(
      () => !document.getElementById("refresh").disabled,
    );
    assert.equal(seen.options.length, 2);
    assert(
      !/unavailable/.test(await page.locator("#composerHint").innerText()),
    );
    let checked = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/device",
    );
    await page.clock.fastForward(10000);
    await checked;
    assert.equal(
      seen.options.length,
      2,
      "unchanged online check reloaded the full catalog",
    );
    state.online = false;
    checked = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/device",
    );
    await page.clock.fastForward(10000);
    await checked;
    await page.locator("#deviceOffline:visible").waitFor();
    state.online = true;
    state.nativeReady = false;
    await page.locator("#retryDevice").click();
    await page
      .locator("#composerHint")
      .filter({ hasText: "Background conversations are unavailable." })
      .waitFor();
    assert.equal(
      seen.options.length,
      3,
      "online recovery kept cached native capability",
    );
    assert.equal(
      await page.locator("#message").inputValue(),
      "Retain the draft across recovery.",
    );
    assert.match(await page.locator("#model").innerText(), /Codex Fast/);
    await f.clean();
  });

  test(`${engine}: superseded background options cannot authorize creation or report the app unavailable`, async (t) => {
    let releaseFresh, startedFresh;
    const pending = new Promise((resolve) => {
        releaseFresh = resolve;
      }),
      freshStarted = new Promise((resolve) => {
        startedFresh = resolve;
      });
    const f = await fixture(t, engine, {
      beforeOptions(_query, _state, seen) {
        if (seen.options.length === 2) {
          startedFresh();
          return pending;
        }
      },
    });
    const { page, seen } = f;
    await page.locator("#message").fill("Retain a superseded creation draft.");
    await page.locator("#send").click();
    await freshStarted;
    await page.locator("#refresh").click();
    await page.waitForFunction(
      () => !document.getElementById("refresh").disabled,
    );
    assert.equal(seen.options.length, 3);
    releaseFresh();
    await page
      .locator("#notice")
      .filter({ hasText: "Connection failed." })
      .waitFor();
    assert.equal(
      seen.posts.filter((post) => post.path === "/api/threads").length,
      0,
    );
    assert.equal(
      await page.locator("#message").inputValue(),
      "Retain a superseded creation draft.",
    );
    assert(
      !/unavailable/.test(await page.locator("#composerHint").innerText()),
    );
    await f.clean();
  });

  test(`${engine}: opening multiple shared projects waits for a chosen conversation or folder before requesting options`, async (t) => {
    const f = await fixture(t, engine, {
      projects: [project, otherProject],
      rows: [
        session,
        {
          ...session,
          id: "docs-initial",
          cwd: otherProject,
          title: "Docs history",
        },
      ],
    });
    const { page, seen } = f;
    assert.equal(
      seen.options.length,
      0,
      "initial options request omitted both project and thread",
    );
    assert.equal(await page.locator("#notice").innerText(), "");
    assert(await page.locator("#composer").isHidden());
    assert(await page.locator("#message").isDisabled());
    assert(await page.locator("#send").isDisabled());
    await page.locator("#message").evaluate((input) => {
      input.value = "Do not create a task without a project.";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#composer").dispatchEvent("submit");
    assert.equal(
      seen.posts.filter((post) => post.path === "/api/threads").length,
      0,
      "hidden composer created an unscoped conversation",
    );
    await page.locator("#breadcrumbProject").click();
    await page
      .locator('#menu [role="menuitemradio"]')
      .filter({ hasText: otherProject })
      .click();
    await page.waitForFunction(
      () => !document.getElementById("model").disabled,
    );
    assert.deepEqual(seen.options.at(-1), { project: otherProject });
    assert(await page.locator("#composer").isVisible());
    assert(await page.locator("#message").isEnabled());
    assert.equal(await page.locator("#notice").innerText(), "");
    await f.clean();
  });

  test(`${engine}: many sessions scroll inside sidebar while footer and composer stay in the viewport`, async (t) => {
    const rows = Array.from({ length: 60 }, (_, index) => ({
      ...session,
      id: "many-session-" + index,
      title:
        "会话 " +
        String(index + 1).padStart(2, "0") +
        " · 检查项目文件与执行计划",
    }));
    const f = await fixture(t, engine, {
      rows,
      width: 1440,
      height: 800,
      locale: "zh-CN",
    });
    const { page } = f;
    for (const viewport of [
      { width: 1440, height: 800 },
      { width: 1440, height: 560 },
      { width: 390, height: 760 },
    ]) {
      await page.setViewportSize(viewport);
      const phone = viewport.width < 760;
      if (
        phone &&
        !(await page
          .locator("body")
          .evaluate((body) => body.classList.contains("nav-open")))
      )
        await page.locator("#sidebarToggle").click();
      if (phone)
        await page.waitForFunction(
          () =>
            Math.abs(
              document.getElementById("sidebar").getBoundingClientRect().left,
            ) < 1,
        );
      const layout = await page.evaluate(() => {
        const bounds = (selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, height: rect.height };
        };
        const nav = document.querySelector("#navigation");
        return {
          height: innerHeight,
          pageHeight: document.documentElement.scrollHeight,
          sidebar: bounds("#sidebar"),
          footer: bounds(".sidebar-footer"),
          composer: bounds("#composer"),
          navigation: {
            height: nav.clientHeight,
            scrollHeight: nav.scrollHeight,
          },
        };
      });
      assert(
        layout.sidebar.top >= -1 &&
          layout.sidebar.bottom <= viewport.height + 1,
        "sidebar stretches beyond the viewport: " + JSON.stringify(layout),
      );
      assert(
        layout.footer.top >= 0 && layout.footer.bottom <= viewport.height + 1,
        "sidebar footer is outside the viewport: " + JSON.stringify(layout),
      );
      assert(
        layout.composer.top >= 0 &&
          layout.composer.bottom <= viewport.height + 1,
        "composer is outside the viewport: " + JSON.stringify(layout),
      );
      assert(
        layout.pageHeight <= viewport.height + 1,
        "conversation creates page-level vertical scrolling: " +
          JSON.stringify(layout),
      );
      assert(
        layout.navigation.scrollHeight > layout.navigation.height + 100,
        "long history does not have its own scroll area: " +
          JSON.stringify(layout),
      );
      await page.locator("#navigation").evaluate((nav) => {
        nav.scrollTop = nav.scrollHeight;
      });
      const last = page.locator('#sessions button[data-id="many-session-59"]');
      await last.waitFor({ state: "visible" });
      const scroll = await last.evaluate((button) => {
        const nav = document.getElementById("navigation"),
          item = button.getBoundingClientRect(),
          area = nav.getBoundingClientRect();
        return {
          top: item.top,
          bottom: item.bottom,
          navTop: area.top,
          navBottom: area.bottom,
          scrollTop: nav.scrollTop,
          pageY: window.scrollY,
        };
      });
      assert(
        scroll.scrollTop > 0 &&
          scroll.top >= scroll.navTop - 1 &&
          scroll.bottom <= scroll.navBottom + 1,
        "last conversation cannot be reached within sidebar: " +
          JSON.stringify(scroll),
      );
      assert.equal(scroll.pageY, 0, "scrolling history moved the document");
      await last.click();
      await page.waitForFunction(
        () =>
          document.querySelector('#sessions button[aria-current="true"]')
            ?.dataset.id === "many-session-59",
      );
      const composer = await page.locator("#composer").boundingBox();
      assert(
        composer.y >= 0 && composer.y + composer.height <= viewport.height + 1,
        "selecting the last session pushed composer outside viewport",
      );
      if (phone) {
        await page.locator("#sidebarToggle").click();
        await page.waitForFunction(
          () =>
            Math.abs(
              document.getElementById("sidebar").getBoundingClientRect().left,
            ) < 1,
        );
      }
      await screenshot(
        page,
        `workspace-many-sessions-${engine}-${viewport.width}x${viewport.height}.png`,
      );
    }
    await f.clean();
  });

  test(`${engine}: compressed history warnings remain visible after loading sessions`, async (t) => {
    const warning =
      "Some compressed Codex history could not be loaded. Install zstd to include it.";
    const f = await fixture(t, engine, { historyWarning: warning });
    await f.page.locator("#notice").filter({ hasText: warning }).waitFor();
    await f.clean();
  });

  test(`${engine}: long Chinese and unbroken session titles stay inside sidebar after focus and selection`, async (t) => {
    const rows = [
      {
        ...session,
        id: "long-chinese",
        title:
          "请帮我审查整个项目并完成远程访问的独立部署配置以及执行后的文件变更记录和计划确认".repeat(
            4,
          ),
      },
      {
        ...session,
        id: "long-english",
        title:
          "RemoteConversationWithoutAnyWhitespaceForProjectPermissionsAndStreamingOutput".repeat(
            10,
          ),
      },
      { ...session, id: "short-chinese", title: "创建测试文件" },
    ];
    const f = await fixture(t, engine, { rows, locale: "zh-CN" });
    const { page } = f;
    await page.emulateMedia({ reducedMotion: "reduce" });
    const bounded = () =>
      page.locator("#navigation").evaluate((nav) => {
        const bounds = nav.getBoundingClientRect();
        const children = [
          ...nav.querySelectorAll(
            "#sessions, .project-group, #sessions button",
          ),
        ].map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            tag: node.tagName,
            className: node.className,
            width: rect.width,
            left: rect.left,
            right: rect.right,
          };
        });
        return {
          width: nav.clientWidth,
          scrollWidth: nav.scrollWidth,
          scrollLeft: nav.scrollLeft,
          bounds: { left: bounds.left, right: bounds.right },
          children,
        };
      });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 960 });
      if (width < 760) await page.locator("#sidebarToggle").click();
      for (const row of rows) {
        const button = page.locator(
          '#sessions button[data-id="' + row.id + '"]',
        );
        await button.focus();
        let layout = await bounded();
        assert(
          layout.children.every((child) => child.width <= layout.width + 1),
          "session group/button expands beyond navigation: " +
            JSON.stringify(layout),
        );
        assert(
          layout.scrollWidth <= layout.width + 1,
          "sidebar navigation overflows horizontally: " +
            JSON.stringify(layout),
        );
        assert.equal(
          layout.scrollLeft,
          0,
          "focus scrolled the sidebar sideways",
        );
        await button.click();
        await page.waitForFunction(
          (id) =>
            document.querySelector('#sessions button[aria-current="true"]')
              ?.dataset.id === id,
          row.id,
        );
        if (width < 760) await page.locator("#sidebarToggle").click();
        await page
          .locator('#sessions button[data-id="' + row.id + '"]')
          .focus();
        layout = await bounded();
        assert(
          layout.children.every(
            (child) =>
              child.left >= layout.bounds.left - 1 &&
              child.right <= layout.bounds.right + 1,
          ),
          "session titles were clipped outside sidebar after selection: " +
            JSON.stringify(layout),
        );
        assert(
          layout.scrollWidth <= layout.width + 1,
          "selected sidebar navigation overflows horizontally: " +
            JSON.stringify(layout),
        );
        assert.equal(
          layout.scrollLeft,
          0,
          "selection/focus scrolled the sidebar sideways",
        );
      }
      await screenshot(page, `workspace-long-titles-${engine}-${width}.png`);
    }
    await f.clean();
  });

  test(`${engine}: selecting a conversation keeps all shared projects visible until an explicit list filter`, async (t) => {
    const other = {
      ...session,
      id: "vscode-chat",
      title: "VS Code task",
      cwd: otherProject,
      source: "vscode",
      status: "running",
    };
    const f = await fixture(t, engine, {
      projects: [project, otherProject],
      rows: [session, other],
    });
    const { page, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.locator("#refresh").click();
    await page.waitForFunction(
      () => !document.getElementById("refresh").disabled,
    );
    assert.equal(
      seen.lists.at(-1).project,
      "",
      "selecting a thread silently narrowed the list filter",
    );
    assert.equal(
      await page.locator('#sessions button[data-id="vscode-chat"]').count(),
      1,
      "another shared project disappeared",
    );
    await page.locator("#project").click();
    await page
      .locator("#projects button")
      .filter({ hasText: otherProject })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll("#sessions button").length === 1,
    );
    assert.equal(seen.lists.at(-1).project, otherProject);
    assert.equal(
      await page.locator("#title").innerText(),
      session.title,
      "filtering the list discarded the selected conversation",
    );
    await f.clean();
  });

  test(`${engine}: native owner observation streams progress and context while guarding every mutation`, async (t) => {
    const external = { ...session, source: "codex-app", status: "running" };
    const capabilities = {
      send: false,
      queue: false,
      steer: false,
      interrupt: false,
      answer: false,
      configure: false,
      plan: false,
    };
    const owner = {
      kind: "native",
      state: "observing",
      epoch: "app-owner-1",
      notice:
        "Watching the original app. Its control connection is unavailable.",
      capabilities,
    };
    const f = await fixture(t, engine, {
      streaming: true,
      rows: [external],
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        queues: {
          [session.id]: [
            {
              id: "blocked-queue",
              text: "Saved native follow-up.",
              status: "waiting",
            },
          ],
        },
        live: {
          status: "inProgress",
          turn_id: "app-turn",
          owner,
          context: {
            used_tokens: 32000,
            window_tokens: 128000,
            used_percent: 25,
            compaction: { status: "idle" },
          },
          items: [
            {
              id: "app-live",
              type: "agentMessage",
              text: "The original app is running.",
            },
          ],
          requests: [
            {
              id: "native-q",
              method: "item/tool/requestUserInput",
              params: {
                questions: [
                  { id: "scope", question: "Native owner question?" },
                ],
              },
            },
          ],
        },
        pendingPlan: {
          id: "native-plan",
          text: "Do the work.",
          turn_id: "prior-plan",
        },
      },
    });
    const { page, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(() => window.fixtureStreams.length === 1);
    await page
      .locator("#ownerNotice")
      .filter({ hasText: owner.notice })
      .waitFor();
    await page.locator("#contextUsage").filter({ hasText: "25%" }).waitFor();
    const ring = page.locator("circle#contextUsageRing");
    assert.equal(await ring.getAttribute("pathLength"), "100");
    assert.equal(
      await ring.evaluate((circle) =>
        parseFloat(circle.style.strokeDashoffset),
      ),
      75,
    );
    assert(
      await page.locator("#contextBar").isHidden(),
      "idle context usage occupied the compaction banner",
    );
    await page.locator("#contextUsage").click();
    await page.locator("#contextUsageDialog[open]").waitFor();
    assert.match(await page.locator("#contextUsageSummary").innerText(), /25%/);
    assert.match(
      await page.locator("#contextUsageDetail").innerText(),
      /32,000/,
    );
    assert.match(
      await page.locator("#contextUsageDetail").innerText(),
      /128,000/,
    );
    await page.keyboard.press("Escape");
    assert.match(await page.locator("#sourceBadge").innerText(), /Codex App/);
    assert.equal(
      await page.locator("#requestDialog").evaluate((dialog) => dialog.open),
      false,
      "watch-only native approval was presented as actionable",
    );
    await page
      .locator("#message")
      .fill("Keep this draft while the original app is unavailable.");
    assert(await page.locator("#send").isDisabled());
    assert(await page.locator("#stop").isDisabled());
    for (const id of ["model", "effort", "mode", "permission", "attach"])
      assert(
        await page.locator("#" + id).isDisabled(),
        id + " is actionable without native owner control",
      );
    const before = seen.posts.length;
    await page.locator("#queueList .queue-steer").waitFor();
    assert(await page.locator("#queueList .queue-steer").isDisabled());
    assert(await page.locator("#queueList .queue-edit").isDisabled());
    assert(await page.locator("#queueList .queue-remove").isDisabled());
    await page.locator("#queueList .queue-steer").dispatchEvent("click");
    await page.locator("#queueList .queue-edit").dispatchEvent("click");
    await page.locator("#queueList .queue-remove").dispatchEvent("click");
    await page.locator("#resumeQueue").dispatchEvent("click");
    await page.locator("#composer").dispatchEvent("submit");
    await page.locator("#stop").dispatchEvent("click");
    await page.locator("#confirmPermission").dispatchEvent("click");
    await page.locator("#confirmExecutePlan").dispatchEvent("click");
    await page.locator("#revisePlanForm").dispatchEvent("submit");
    await page.waitForTimeout(30);
    assert.equal(
      seen.posts.length,
      before,
      "programmatic interaction bypassed owner capabilities",
    );
    assert.deepEqual(seen.queueDeletes, []);
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [
          {
            id: "app-live",
            type: "agentMessage",
            text: "New progress from Codex App.",
          },
        ],
        remove: [],
        state: {
          context: {
            used_tokens: null,
            window_tokens: 128000,
            used_percent: null,
            compaction: { status: "inProgress", id: "compact-1" },
          },
        },
      }),
    );
    await page
      .getByText("New progress from Codex App.", { exact: true })
      .waitFor();
    await page
      .locator("#contextCompaction")
      .filter({ hasText: "Compacting context" })
      .waitFor();
    assert.match(
      await page.locator("#contextUsageText").textContent(),
      /Unknown/,
    );
    assert(
      !/25%|0%/.test(await page.locator("#contextUsageText").textContent()),
    );
    assert.equal(
      await page.locator("#contextUsage").getAttribute("data-unknown"),
      "true",
    );
    assert.equal(
      await ring.evaluate((circle) =>
        parseFloat(circle.style.strokeDashoffset),
      ),
      100,
    );
    await page.locator("#contextUsage").click();
    assert.match(
      await page.locator("#contextUsageSummary").innerText(),
      /Unknown/,
    );
    const unknownDetails = await page
      .locator("#contextUsageDetail dd")
      .allTextContents();
    assert(
      unknownDetails.some((value) => /Unknown/.test(value)),
      "missing usage was presented as zero",
    );
    assert(
      unknownDetails.some((value) => /128,000/.test(value)),
      "known context window disappeared with unknown usage",
    );
    await page.keyboard.press("Escape");
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [],
        remove: [],
        state: {
          context: {
            used_tokens: 8000,
            window_tokens: 128000,
            used_percent: null,
            compaction: { status: "completed", id: "compact-1" },
          },
        },
      }),
    );
    await page
      .locator("#contextCompaction")
      .filter({ hasText: "Context compacted" })
      .waitFor();
    assert.match(
      await page.locator("#contextUsageText").textContent(),
      /6\.3%/,
    );
    assert.equal(
      await ring.evaluate((circle) =>
        parseFloat(circle.style.strokeDashoffset),
      ),
      93.75,
    );
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [],
        state: {
          context: {
            used_tokens: 8000,
            window_tokens: 128000,
            used_percent: -25,
          },
        },
      }),
    );
    assert.equal(
      await ring.evaluate((circle) =>
        parseFloat(circle.style.strokeDashoffset),
      ),
      93.75,
      "invalid percentage replaced the real token ratio",
    );
    for (const [used, percent, offset] of [
      [0, -25, 100],
      [8000, 140, 0],
    ]) {
      await page.evaluate(
        ({ used, percent }) =>
          window.fixtureStreams[0].emit({
            items: [],
            state: {
              context: {
                used_tokens: used,
                window_tokens: 128000,
                used_percent: percent,
              },
            },
          }),
        { used, percent },
      );
      await page.waitForFunction(
        (offset) =>
          parseFloat(
            document.getElementById("contextUsageRing").style.strokeDashoffset,
          ) === offset,
        offset,
      );
      assert.equal(
        await ring.evaluate((circle) =>
          parseFloat(circle.style.strokeDashoffset),
        ),
        offset,
        "ring exceeded its 0–100 bounds",
      );
    }
    assert.equal(
      await page.locator("#message").inputValue(),
      "Keep this draft while the original app is unavailable.",
    );
    assert.equal(
      await page.locator('#live [data-id="app-live"]').count(),
      1,
      "compaction duplicated or removed existing history",
    );
    await screenshot(page, `workspace-native-observation-${engine}-1440.png`);
    await f.clean();
  });

  test(`${engine}: a connected native owner receives the same thread action with its epoch and disconnect preserves the draft`, async (t) => {
    const capabilities = {
      send: true,
      queue: true,
      steer: true,
      interrupt: true,
      answer: true,
      configure: true,
      plan: true,
    };
    const owner = {
      kind: "native",
      state: "connected",
      epoch: "owner-connected-1",
      notice: "Connected to VS Code.",
      capabilities,
    };
    const f = await fixture(t, engine, {
      streaming: true,
      rows: [{ ...session, source: "vscode", status: "completed" }],
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        live: {
          status: "completed",
          turn_id: "native-done",
          owner,
          items: [],
          requests: [],
        },
      },
      onTurn(state) {
        state.live = {
          ...state.live,
          status: "inProgress",
          turn_id: "native-next",
          items: [],
          requests: [],
        };
      },
    });
    const { page, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(() => window.fixtureStreams.length === 1);
    await page
      .locator("#message")
      .fill("Continue in the original VS Code task.");
    await page.locator("#send").click();
    await page.waitForFunction(
      () => document.getElementById("message").value === "",
    );
    const turn = seen.posts.find((post) => post.path.endsWith("/turn"));
    assert.equal(turn.path, "/api/threads/" + session.id + "/turn");
    assert.equal(turn.ownerEpoch, owner.epoch);
    await page
      .locator("#message")
      .fill("Preserve this after the owner disconnects.");
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [],
        remove: [],
        state: {
          owner: {
            kind: "native",
            state: "offline",
            epoch: "owner-disconnected-2",
            notice: "The original application disconnected.",
            capabilities: {},
          },
        },
      }),
    );
    await page
      .locator("#ownerNotice")
      .filter({ hasText: "The original application disconnected." })
      .waitFor();
    assert(await page.locator("#send").isDisabled());
    assert.equal(
      await page.locator("#state").innerText(),
      "Status unknown",
      "a disconnected native owner was still presented as actively running",
    );
    assert(await page.locator("#working").isHidden());
    assert.equal(
      await page.locator("#message").inputValue(),
      "Preserve this after the owner disconnects.",
    );
    const count = seen.posts.length;
    await page.locator("#composer").dispatchEvent("submit");
    await page.locator("#stop").dispatchEvent("click");
    assert.equal(seen.posts.length, count);
    await screenshot(page, `workspace-native-disconnected-${engine}-1440.png`);
    await f.clean();
  });

  test(`${engine}: owner epoch changes close stale confirmations and explicit capabilities guard native approvals`, async (t) => {
    const full = {
      send: true,
      queue: true,
      steer: true,
      interrupt: true,
      answer: true,
      configure: true,
      plan: true,
    };
    const owner = {
      kind: "native",
      state: "connected",
      epoch: "native-epoch-1",
      capabilities: full,
    };
    const f = await fixture(t, engine, {
      streaming: true,
      rows: [{ ...session, source: "vscode" }],
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        live: {
          status: "completed",
          turn_id: "native-completed",
          owner,
          items: [],
          requests: [],
        },
        pendingPlan: {
          id: "epoch-plan",
          text: "A native plan.",
          turn_id: "native-completed",
        },
      },
    });
    const { page, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(() => window.fixtureStreams.length === 1);
    await page.locator("#planAction:visible").waitFor();
    await page.locator("#message").fill("Keep the current native-task draft.");
    await menu(page, "permission", "Full access");
    await page.locator("#permissionDialog[open]").waitFor();
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [],
        remove: [],
        state: {
          owner: {
            kind: "native",
            state: "connected",
            epoch: "native-epoch-2",
            capabilities: {
              send: true,
              queue: true,
              steer: true,
              interrupt: true,
              answer: true,
              configure: true,
              plan: true,
            },
          },
        },
      }),
    );
    await page.locator("#permissionDialog").waitFor({ state: "hidden" });
    await page.locator("#confirmPermission").dispatchEvent("click");
    assert(
      !/Full access/.test(await page.locator("#permission").innerText()),
      "a confirmation from an earlier native owner changed permissions",
    );
    await page.locator("#executePlan").click();
    await page.locator("#executePlanDialog[open]").waitFor();
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [],
        remove: [],
        state: {
          owner: {
            kind: "native",
            state: "connected",
            epoch: "native-epoch-3",
            capabilities: {
              send: true,
              queue: true,
              steer: true,
              interrupt: true,
              answer: false,
              configure: false,
              plan: false,
            },
          },
          requests: [
            {
              id: "native-approval",
              method: "item/commandExecution/requestApproval",
              params: { command: "native command" },
            },
          ],
        },
      }),
    );
    await page.locator("#executePlanDialog").waitFor({ state: "hidden" });
    await page.locator("#confirmExecutePlan").dispatchEvent("click");
    await page.locator("#pendingRequest").dispatchEvent("click");
    assert.equal(
      await page.locator("#requestDialog").evaluate((dialog) => dialog.open),
      false,
      "an unavailable native approval was made actionable",
    );
    assert(await page.locator("#model").isDisabled());
    assert(await page.locator("#permission").isDisabled());
    assert(await page.locator("#executePlan").isDisabled());
    assert.equal(
      seen.posts.filter(
        (post) =>
          post.path.endsWith("/execute-plan") || post.path.endsWith("/answer"),
      ).length,
      0,
    );
    assert.equal(
      await page.locator("#message").inputValue(),
      "Keep the current native-task draft.",
    );
    await f.clean();
  });

  test(`${engine}: legacy-only native history stays read-only without a desktop connect fallback`, async (t) => {
    const owner = {
      kind: "native",
      state: "observing",
      epoch: "unloaded-1",
      notice: "Open this conversation in Codex to connect.",
      capabilities: { connect: true },
    };
    const f = await fixture(t, engine, {
      rows: [{ ...session, source: "codex-app" }],
      state: {
        historyItems: [
          {
            id: "original-history",
            type: "agentMessage",
            text: "History from the original app.",
          },
        ],
        live: { status: "unknown", owner, items: [], requests: [] },
      },
    });
    const { page, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page
      .getByText("History from the original app.", { exact: true })
      .waitFor();
    assert(await page.locator("#connectOwner").isHidden());
    assert.match(
      await page.locator("#ownerNotice").innerText(),
      /Update agentTools/,
    );
    assert(
      !/Open this conversation in Codex/.test(
        await page.locator("#ownerNotice").innerText(),
      ),
    );
    await page
      .locator("#message")
      .fill("Keep this draft until background connection is available.");
    await page.locator("#connectOwner").dispatchEvent("click");
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.locator("#refresh").click();
    await page.waitForFunction(
      () => !document.getElementById("refresh").disabled,
    );
    assert.equal(
      await page.locator("#message").inputValue(),
      "Keep this draft until background connection is available.",
    );
    assert(await page.locator("#send").isDisabled());
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/connect")).length,
      0,
      "manual legacy connection bypassed the missing background capability",
    );
    assert.equal(
      page.url(),
      f.origin + "/",
      "legacy selection opened a desktop deep link",
    );
    assert.equal(
      seen.posts.filter(
        (post) => post.path === "/api/threads" || post.path.endsWith("/turn"),
      ).length,
      0,
      "legacy history created a replacement conversation or started a new turn",
    );
    await f.clean();
  });

  test(`${engine}: selecting history attaches in the background once and reselecting keeps the draft and attachments`, async (t) => {
    const connected = {
      kind: "native",
      state: "connected",
      epoch: "auto-connected-owner",
      capabilities: { send: true, configure: true },
    };
    const f = await fixture(t, engine, {
      streaming: true,
      rows: [{ ...session, source: "codex-app" }],
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        live: {
          status: "unknown",
          owner: {
            kind: "native",
            state: "observing",
            capabilities: { connect: true, background_connect: true },
          },
          items: [],
          requests: [],
        },
      },
      onConnect(state) {
        state.live = { ...state.live, status: "idle", owner: connected };
      },
    });
    const { page, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(
      () =>
        !document.getElementById("model").disabled &&
        document.getElementById("connectOwner").hidden,
    );
    const connects = () =>
      seen.posts.filter((post) => post.path.endsWith("/connect"));
    assert.equal(
      connects().length,
      1,
      "selecting an unloaded history did not connect its original owner",
    );
    assert.equal(connects()[0].path, "/api/threads/" + session.id + "/connect");
    assert(!connects()[0].ownerEpoch);
    assert.equal(connects()[0].data.executor, "background");
    await page.waitForFunction(
      () => !document.getElementById("model").disabled,
    );
    await page.locator("#message").fill("Keep the selected history draft.");
    await page
      .locator("#fileInput")
      .setInputFiles({
        name: "history.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("history attachment"),
      });
    await page.locator("#attachments .attachment-chip").waitFor();
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    assert.equal(
      await page.locator("#message").inputValue(),
      "Keep the selected history draft.",
    );
    assert.equal(
      await page.locator("#attachments .attachment-chip").count(),
      1,
    );
    assert.deepEqual(seen.deletes, []);
    await page.locator("#refresh").click();
    await page.waitForFunction(
      () => !document.getElementById("refresh").disabled,
    );
    await page.clock.fastForward(30000);
    await page.evaluate(() =>
      window.fixtureStreams
        .at(-1)
        .emit({
          items: [],
          state: {
            owner: {
              kind: "native",
              state: "observing",
              capabilities: { connect: true },
            },
          },
        }),
    );
    assert.equal(
      connects().length,
      1,
      "a refresh, periodic check or owner update repeated the deep link",
    );
    assert.equal(
      seen.posts.filter(
        (post) => post.path === "/api/threads" || post.path.endsWith("/turn"),
      ).length,
      0,
    );
    await f.clean();
  });

  test(`${engine}: history, background connection and streaming do not wait for the options catalog`, async (t) => {
    let release;
    const held = new Promise((resolve) => (release = resolve));
    t.after(() => release());
    const owner = {
      kind: "background",
      state: "connected",
      epoch: "background-with-slow-catalog",
      capabilities: { send: true, configure: true },
    };
    const f = await fixture(t, engine, {
      streaming: true,
      beforeOptions(query) {
        if (query.thread) return held;
      },
      state: {
        historyItems: [
          {
            id: "fast-history",
            type: "agentMessage",
            text: "History arrived before catalog.",
          },
        ],
        live: {
          status: "unknown",
          items: [],
          requests: [],
          owner: {
            kind: "native",
            state: "observing",
            capabilities: { connect: true, background_connect: true },
          },
        },
      },
      onConnect(state) {
        state.live = { ...state.live, status: "idle", owner };
      },
    });
    const { page, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page
      .getByText("History arrived before catalog.", { exact: true })
      .waitFor();
    await page.waitForFunction(
      () =>
        window.fixtureStreams.length === 1 &&
        document.getElementById("connectOwner").hidden,
    );
    assert(
      await page.locator("#model").isDisabled(),
      "test catalog should still be pending",
    );
    assert.equal(
      seen.posts.find((post) => post.path.endsWith("/connect")).data.executor,
      "background",
    );
    await page
      .locator("#message")
      .fill("Continue without changing the desktop chat.");
    assert(await page.locator("#send").isEnabled());
    release();
    await page.waitForFunction(
      () => !document.getElementById("model").disabled,
    );
    await f.clean();
  });

  for (const newerStream of [false, true])
    test(`${engine}: confirmed connection snapshot avoids rereading history${newerStream ? " and preserves newer live updates" : ""}`, async (t) => {
      let release, started;
      const held = new Promise((resolve) => (release = resolve)),
        pending = new Promise((resolve) => (started = resolve));
      t.after(() => release());
      const connected = {
        kind: "native",
        state: "connected",
        epoch: "confirmed-owner",
        capabilities: { send: true, configure: true },
      };
      const f = await fixture(t, engine, {
        streaming: true,
        connectSnapshot: true,
        state: {
          historyItems: [
            {
              id: "history-before-connect",
              type: "agentMessage",
              text: "Original history remains visible.",
            },
          ],
          live: {
            status: "unknown",
            items: [{ id: "live-before-connect", type: "agentMessage", text: "Earlier visible live answer remains." }],
            requests: [],
            owner: {
              kind: "native",
              state: "observing",
              capabilities: { background_connect: true },
            },
          },
        },
        beforeConnect() {
          started();
          return held;
        },
        onConnect(state) {
          state.live = {
            status: "idle",
            items: [],
            requests: [],
            owner: connected,
            title: "Confirmed conversation",
          };
        },
      });
      const { page, seen } = f;
      await page.locator('#sessions button[data-id="remote-rich"]').click();
      await pending;
      await page.locator("#message").fill("Continue the conversation.");
      if (newerStream) {
        await page.evaluate(() =>
          window.fixtureStreams
            .at(-1)
            .emit({
              items: [],
              state: {
                status: "idle",
                title: "Newer streamed title",
                owner: {
                  kind: "native",
                  state: "connected",
                  epoch: "newer-stream-owner",
                  capabilities: { send: true, configure: true },
                },
              },
            }),
        );
      }
      release();
      await page.waitForFunction(
        () =>
          document.getElementById("connectOwner").hidden &&
          !document.getElementById("send").disabled,
      );
      await page
        .getByText("Original history remains visible.", { exact: true })
        .waitFor();
      await page.getByText("Earlier visible live answer remains.", { exact: true }).waitFor();
      assert.equal(
        seen.details.length,
        1,
        "a confirmed owner triggered another full history download",
      );
      assert.equal(
        await page.locator("#title").innerText(),
        newerStream ? "Newer streamed title" : "Confirmed conversation",
      );
      assert(
        !/Connecting this conversation/.test(
          await page.locator("#connectionLabel").innerText(),
        ),
      );
      assert.equal(
        seen.posts.filter((post) => post.path.endsWith("/connect")).length,
        1,
      );
      await f.clean();
    });

  test(`${engine}: a new background conversation opens before refreshing a slow session list`, async (t) => {
    let release, started;
    const held = new Promise((resolve) => (release = resolve)),
      pending = new Promise((resolve) => (started = resolve));
    t.after(() => release());
    const created = {
        ...session,
        id: "background-new-before-list",
        title: "New background chat",
        source: "remote",
      },
      owner = {
        kind: "background",
        state: "connected",
        epoch: "created-before-list",
        capabilities: { send: true, configure: true },
      };
    const f = await fixture(t, engine, {
      streaming: true,
      beforeList(_state, seen) {
        if (seen.lists.length > 1) {
          started();
          return held;
        }
      },
      onCreate(state) {
        state.rows.push(created);
        state.live = { status: "idle", items: [], requests: [], owner };
        return created;
      },
    });
    const { page, seen } = f;
    await page.locator("#new").click();
    await page.locator("#title").filter({ hasText: created.title }).waitFor();
    await pending;
    assert(seen.details.includes("/api/sessions/" + created.id));
    await page
      .locator("#message")
      .fill("The list refresh does not block this draft.");
    assert(await page.locator("#send").isEnabled());
    release();
    await page.waitForFunction(() => !document.getElementById("new").disabled);
    await f.clean();
  });

  for (const heldAt of ["detail", "connect"])
    test(`${engine}: selecting another history supersedes a pending ${heldAt} without connecting or changing the wrong conversation`, async (t) => {
      const second = {
          ...session,
          id: "native-second",
          title: "Second native history",
        },
        observing = {
          kind: "native",
          state: "observing",
          capabilities: { connect: true, background_connect: true },
        },
        connected = {
          kind: "native",
          state: "connected",
          epoch: "selected-owner",
          capabilities: { send: true, configure: true },
        };
      const f = await fixture(t, engine, {
        streaming: true,
        rows: [
          { ...session, source: "codex-app" },
          { ...second, source: "codex-app" },
        ],
        state: {
          live: {
            status: "unknown",
            owner: observing,
            items: [],
            requests: [],
          },
          threadLives: {
            [second.id]: {
              status: "idle",
              owner: connected,
              items: [],
              requests: [],
            },
          },
        },
      });
      const { page, seen } = f;
      let release, started;
      const held = new Promise((resolve) => (release = resolve)),
        pending = new Promise((resolve) => (started = resolve));
      t.after(() => release());
      const target =
        heldAt === "detail"
          ? "**/api/sessions/" + session.id
          : heldAt === "options"
            ? "**/api/options?*thread=" + session.id
            : "**/api/threads/" + session.id + "/connect";
      await page.route(target, async (route) => {
        started();
        await held;
        try {
          if (heldAt === "connect")
            return await route.fulfill({ json: { connected: true } });
          return await route.fallback();
        } catch (error) {
          if (!/handled|closed|canceled|cancelled/i.test(error.message))
            throw error;
        }
      });
      await page.locator('#sessions button[data-id="remote-rich"]').click();
      await pending;
      let aborted = false;
      page.on("requestfailed", (request) => {
        if (
          new URL(request.url()).pathname ===
          "/api/threads/" + session.id + "/connect"
        )
          aborted = true;
      });
      await page.locator('#sessions button[data-id="native-second"]').click();
      await page.waitForFunction(
        () =>
          document.getElementById("title").textContent ===
            "Second native history" &&
          !document.getElementById("model").disabled,
      );
      await page.locator("#message").fill("Keep the second history draft.");
      const optionCount = seen.options.filter(
        (query) => query.thread === second.id,
      ).length;
      release();
      await page.waitForTimeout(50);
      assert.equal(await page.locator("#title").innerText(), second.title);
      assert.equal(
        await page.locator("#message").inputValue(),
        "Keep the second history draft.",
      );
      assert(await page.locator("#send").isEnabled());
      assert.equal(
        seen.options.filter((query) => query.thread === second.id).length,
        optionCount,
        "a stale selection loaded options for the newer selection",
      );
      const connects = seen.posts.filter((post) =>
        post.path.endsWith("/connect"),
      );
      assert.equal(
        connects.length,
        0,
        "a superseded detail/options response navigated the original application",
      );
      if (heldAt === "connect")
        assert(
          aborted,
          "switching history left the previous connection request active",
        );
      assert.equal(
        seen.posts.filter(
          (post) => post.path === "/api/threads" || post.path.endsWith("/turn"),
        ).length,
        0,
      );
      await f.clean();
    });

  test(`${engine}: reselecting the original history supersedes a navigation waiting for attachment cleanup`, async (t) => {
    const second = {
        ...session,
        id: "cleanup-second",
        title: "Cleanup second history",
      },
      owner = {
        kind: "native",
        state: "connected",
        epoch: "cleanup-owner",
        capabilities: { send: true, configure: true },
      };
    const f = await fixture(t, engine, {
      rows: [{ ...session, source: "codex-app" }, second],
      state: { live: { status: "idle", owner, items: [], requests: [] } },
    });
    const { page } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(
      () => !document.getElementById("attach").disabled,
    );
    await page
      .locator("#fileInput")
      .setInputFiles({
        name: "cleanup.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("old attachment"),
      });
    await page.locator("#attachments .attachment-chip").waitFor();
    let release, started;
    const held = new Promise((resolve) => (release = resolve)),
      pending = new Promise((resolve) => (started = resolve));
    t.after(() => release());
    let first = true;
    await page.route("**/api/attachments/*", async (route) => {
      if (route.request().method() === "DELETE" && first) {
        first = false;
        started();
        await held;
      }
      return route.fallback();
    });
    await page.locator('#sessions button[data-id="cleanup-second"]').click();
    await pending;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    release();
    await page.waitForTimeout(60);
    assert.equal(
      await page.locator("#title").innerText(),
      session.title,
      "the pending earlier selection overrode the latest selection",
    );
    assert.equal(
      await page.locator("#attachments .attachment-chip").count(),
      0,
      "a discarded attachment was retained as usable",
    );
    await f.clean();
  });

  test(`${engine}: reselecting a history supersedes a folder change waiting for attachment cleanup`, async (t) => {
    const owner = {
      kind: "native",
      state: "connected",
      epoch: "folder-cleanup-owner",
      capabilities: { send: true, configure: true },
    };
    const f = await fixture(t, engine, {
      projects: [project, otherProject],
      rows: [{ ...session, source: "codex-app" }],
      state: { live: { status: "idle", owner, items: [], requests: [] } },
    });
    const { page, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(
      () => !document.getElementById("attach").disabled,
    );
    await page
      .locator("#fileInput")
      .setInputFiles({
        name: "folder-cleanup.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("old attachment"),
      });
    await page.locator("#attachments .attachment-chip").waitFor();
    let release, started;
    const held = new Promise((resolve) => (release = resolve)),
      pending = new Promise((resolve) => (started = resolve));
    t.after(() => release());
    let first = true;
    await page.route("**/api/attachments/*", async (route) => {
      if (route.request().method() === "DELETE" && first) {
        first = false;
        started();
        await held;
      }
      return route.fallback();
    });
    await page.locator("#breadcrumbProject").click();
    await page
      .locator("#menu button")
      .filter({ hasText: otherProject })
      .click();
    await pending;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    release();
    await page.waitForTimeout(60);
    assert.equal(
      await page.locator("#title").innerText(),
      session.title,
      "a superseded folder reset cleared the selected history",
    );
    assert.equal(await page.locator("#breadcrumbProject").innerText(), "shop");
    assert(
      seen.options.every((query) => query.project !== otherProject),
      "a superseded folder reset loaded the wrong project catalog",
    );
    await f.clean();
  });

  test(`${engine}: selection does not auto-connect unavailable, archived, offline or unsupported owners`, async (t) => {
    const noConnect = {
        kind: "native",
        state: "observing",
        capabilities: { connect: false },
      },
      connected = {
        kind: "native",
        state: "connected",
        epoch: "guard-owner",
        capabilities: { send: true, configure: true },
      };
    const f = await fixture(t, engine, {
      rows: [{ ...session, source: "vscode" }],
      state: {
        live: { status: "unknown", owner: noConnect, items: [], requests: [] },
      },
    });
    const { page, seen, state } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(
      () => document.getElementById("title").textContent === "Build checkout",
    );
    assert(await page.locator("#connectOwner").isHidden());
    state.live = { status: "idle", owner: connected, items: [], requests: [] };
    await page.locator("#refresh").click();
    await page.waitForFunction(
      () => !document.getElementById("model").disabled,
    );
    await page.locator("#message").fill("Keep while offline");
    state.online = false;
    await page.locator("#retryDevice").dispatchEvent("click");
    await page.locator("#deviceOffline:visible").waitFor();
    await page
      .locator('#sessions button[data-id="remote-rich"]')
      .dispatchEvent("click");
    assert.equal(
      await page.locator("#message").inputValue(),
      "Keep while offline",
    );
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/connect")).length,
      0,
    );
    await f.clean();
    for (const archived of [false, true]) {
      const blocked = await fixture(t, engine, {
        rows: [{ ...session, source: "codex-app" }],
        state: {
          archivedDetail: archived,
          detailHistoryUnavailable: !archived,
          live: {
            status: "unknown",
            owner: {
              kind: "native",
              state: "observing",
              capabilities: { connect: true },
            },
            items: [],
            requests: [],
          },
        },
      });
      await blocked.page
        .locator('#sessions button[data-id="remote-rich"]')
        .click();
      await blocked.page
        .locator("#notice")
        .filter({ hasText: archived ? "archived" : "archive state" })
        .waitFor();
      assert.equal(
        blocked.seen.posts.filter((post) => post.path.endsWith("/connect"))
          .length,
        0,
      );
      await blocked.clean();
    }
  });

  for (const cancelVia of ["logout", "archived", "unavailable"])
    test(`${engine}: ${cancelVia} cancels a pending history connection without running another task`, async (t) => {
      const connected = {
          kind: "native",
          state: "connected",
          epoch: "cancel-owner",
          capabilities: { send: true, configure: true },
        },
        f = await fixture(t, engine, {
          streaming: true,
          rows: [{ ...session, source: "codex-app" }],
          catalog: {
            capabilities: { ...catalog.capabilities, streaming: true },
          },
          state: {
            live: { status: "idle", owner: connected, items: [], requests: [] },
          },
        });
      const { page, seen } = f;
      await page.locator('#sessions button[data-id="remote-rich"]').click();
      await page.waitForFunction(() => window.fixtureStreams.length === 1);
      await page
        .locator("#message")
        .fill("Preserve while connection is pending.");
      await page
        .locator("#fileInput")
        .setInputFiles({
          name: "cancel.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("cancel attachment"),
        });
      await page.locator("#attachments .attachment-chip").waitFor();
      let release, started, cleanupStarted;
      const held = new Promise((resolve) => (release = resolve)),
        pending = new Promise((resolve) => (started = resolve)),
        cleanup = new Promise((resolve) => (cleanupStarted = resolve));
      t.after(() => release());
      await page.route(
        "**/api/threads/" + session.id + "/connect",
        async (route) => {
          started();
          await held;
          try {
            await route.fulfill({ json: { connected: true } });
          } catch (error) {
            if (!/handled|closed|canceled|cancelled/i.test(error.message))
              throw error;
          }
        },
      );
      if (cancelVia === "logout")
        await page.route("**/api/attachments/*", async (route) => {
          if (route.request().method() === "DELETE") {
            cleanupStarted();
            await held;
          }
          return route.fallback();
        });
      let aborted = false;
      page.on("requestfailed", (request) => {
        if (
          new URL(request.url()).pathname ===
          "/api/threads/" + session.id + "/connect"
        )
          aborted = true;
      });
      await page.evaluate(() =>
        window.fixtureStreams[0].emit({
          items: [],
          state: {
            owner: {
              kind: "native",
              state: "observing",
              capabilities: { connect: true, background_connect: true },
            },
          },
        }),
      );
      await page.locator("#connectOwner").click();
      await pending;
      if (cancelVia === "logout") {
        await page.locator("#logout").click();
        await cleanup;
      } else
        await page.evaluate(
          (type) =>
            window.fixtureStreams[0].emitEvent(
              type,
              type === "archived"
                ? { id: "remote-rich" }
                : {
                    error:
                      "Cannot read the Codex conversation archive state. Refresh after the local index is available.",
                  },
            ),
          cancelVia,
        );
      await page.waitForTimeout(20);
      assert(
        aborted,
        "the pending connection stayed active after " + cancelVia,
      );
      const details = seen.details.length;
      release();
      await page.waitForTimeout(40);
      assert.equal(
        seen.details.length,
        details,
        "a cancelled connection refreshed the old conversation",
      );
      assert.equal(
        seen.posts.filter(
          (post) => post.path === "/api/threads" || post.path.endsWith("/turn"),
        ).length,
        0,
      );
      if (cancelVia !== "logout") {
        assert.equal(
          await page.locator("#message").inputValue(),
          "Preserve while connection is pending.",
        );
        assert.equal(
          await page.locator("#attachments .attachment-chip").count(),
          1,
        );
      }
      await f.clean();
    });

  for (const heldAt of ["detail", "options"])
    test(`${engine}: logout invalidates history selection before a pending ${heldAt} can start connecting`, async (t) => {
      const f = await fixture(t, engine, {
        rows: [{ ...session, source: "codex-app" }],
        state: {
          live: {
            status: "unknown",
            owner: {
              kind: "native",
              state: "observing",
              capabilities: { connect: true },
            },
            items: [],
            requests: [],
          },
        },
      });
      const { page, seen } = f;
      let releaseSelection, releaseLogout, started, logoutStarted;
      const selectionHeld = new Promise(
          (resolve) => (releaseSelection = resolve),
        ),
        logoutHeld = new Promise((resolve) => (releaseLogout = resolve)),
        pending = new Promise((resolve) => (started = resolve)),
        loggingOut = new Promise((resolve) => (logoutStarted = resolve));
      t.after(() => {
        releaseSelection();
        releaseLogout();
      });
      const target =
        heldAt === "detail"
          ? "**/api/sessions/" + session.id
          : "**/api/options?*thread=" + session.id;
      await page.route(target, async (route) => {
        started();
        await selectionHeld;
        return route.fallback();
      });
      await page.route("**/api/logout", async (route) => {
        logoutStarted();
        await logoutHeld;
        return route.fallback();
      });
      await page.locator('#sessions button[data-id="remote-rich"]').click();
      await pending;
      await page.locator("#logout").click();
      await loggingOut;
      releaseSelection();
      await page.waitForTimeout(50);
      assert.equal(
        seen.posts.filter((post) => post.path.endsWith("/connect")).length,
        0,
        "an old history selection started connecting after logout began",
      );
      releaseLogout();
      await page.locator("#pair:visible").waitFor();
      await f.clean();
    });

  test(`${engine}: actual App steering input renders as user messages from details and SSE with source acceptance`, async (t) => {
    const rawText = "请检查 [Image #1]，保留原文。";
    const detailed = steeringItem("app-steering-detail", [
      {
        type: "text",
        text: rawText,
        text_elements: [
          {
            byteRange: { start: 10, end: 20 },
            placeholder: "keep source text",
          },
        ],
      },
      { type: "localImage", path: "/Users/fixture/private/check.png" },
      { type: "localAudio", path: "/Users/fixture/private/note.wav" },
      { type: "image", fileId: "opaque-image" },
      { type: "audio", url: "https://media.invalid/note.wav" },
      {
        type: "skill",
        name: "repo-style",
        path: "/Users/fixture/private/SKILL.md",
      },
      { type: "mention", name: "cart.ts", path: "/work/shop/src/cart.ts" },
    ]);
    const pending = steeringItem(
      "app-steering-live",
      [{ type: "text", text: "A provisional correction.", text_elements: [] }],
      "pending",
    );
    const owner = {
      kind: "native",
      state: "connected",
      epoch: "app-steering-owner",
      capabilities: { send: true, queue: true, steer: true, configure: true },
    };
    const f = await fixture(t, engine, {
      streaming: true,
      rows: [{ ...session, source: "codex-app" }],
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        historyItems: [detailed],
        live: {
          status: "inProgress",
          turn_id: "steering-turn",
          owner,
          items: [],
          requests: [],
        },
      },
    });
    const { page } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(() => window.fixtureStreams.length === 1);
    const history = page.locator('#history [data-id="app-steering-detail"]');
    await history.locator(".user-text").filter({ hasText: rawText }).waitFor();
    assert(
      await history.evaluate((node) => node.matches("article.message.user")),
      "details rendered steering input as a tool",
    );
    assert.equal(
      await history.locator(".user-text").innerText(),
      rawText,
      "text_elements metadata rewrote the native text",
    );
    assert.equal(
      await history.locator(".message-status").innerText(),
      "Accepted",
    );
    const attachments = await history
      .locator(".message-user-attachments")
      .innerText();
    for (const name of [
      "check.png",
      "note.wav",
      "Attached image",
      "Attached audio",
      "repo-style",
      "cart.ts",
    ])
      assert(attachments.includes(name), "steering input omitted " + name);
    assert(
      !/\/Users\/fixture|text_elements|opaque-image/.test(
        await history.innerText(),
      ),
      "native metadata leaked into the bubble",
    );
    assert.equal(
      await history.locator("img").count(),
      0,
      "opaque or local media became an invalid preview",
    );

    await page.evaluate(
      (item) =>
        window.fixtureStreams[0].emit({
          items: [item],
          remove: [],
          state: { status: "inProgress", turn_id: "steering-turn" },
        }),
      pending,
    );
    const live = page.locator('#live [data-id="app-steering-live"]');
    await live
      .locator(".user-text")
      .filter({ hasText: "A provisional correction." })
      .waitFor();
    assert(await live.evaluate((node) => node.matches("article.message.user")));
    assert.equal(
      await live.locator(".message-status").innerText(),
      "Pending",
      "a provisional bubble was marked accepted",
    );
    await page.evaluate(
      (item) =>
        window.fixtureStreams[0].emit({
          items: [{ ...item, data: { ...item.data, status: "accepted" } }],
          remove: [],
          state: {},
        }),
      pending,
    );
    await live
      .locator(".message-status")
      .filter({ hasText: "Accepted" })
      .waitFor();
    assert.equal(
      await page.locator('#live [data-id="app-steering-live"]').count(),
      1,
      "steering acknowledgement duplicated the bubble",
    );
    const unknown = {
      ...pending,
      id: "app-steering-unconfirmed",
      data: { ...pending.data, id: "app-steering-unconfirmed" },
    };
    delete unknown.data.status;
    await page.evaluate(
      (item) =>
        window.fixtureStreams[0].emit({ items: [item], remove: [], state: {} }),
      unknown,
    );
    await page.locator('#live [data-id="app-steering-unconfirmed"]').waitFor();
    assert.equal(
      await page
        .locator('#live [data-id="app-steering-unconfirmed"] .message-status')
        .count(),
      0,
      "completed item metadata fabricated an accepted status",
    );
    assert.equal(await page.locator("#live .message.agent").count(), 0);
    assert.equal(await page.locator("#state").innerText(), "Running");
    await f.clean();
  });

  test(`${engine}: native optimistic user input is replaced during hydration without losing prior turns or compacted history`, async (t) => {
    const synthetic = {
      id: "native-input-client-message-1",
      type: "userMessage",
      turn_id: "native-turn-1",
      status: "completed",
      text: "Inspect this project.",
      data: { content: [{ type: "text", text: "Inspect this project." }] },
    };
    const older = {
      id: "prior-answer",
      type: "agentMessage",
      turn_id: "prior-turn",
      text: "Keep the earlier response.",
    };
    const answer = {
      id: "native-answer-1",
      type: "agentMessage",
      turn_id: "native-turn-1",
      text: "Working on the first turn.",
    };
    const f = await fixture(t, engine, {
      streaming: true,
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        historyItems: [older],
        live: {
          status: "inProgress",
          turn_id: "native-turn-1",
          items: [synthetic, answer],
          requests: [],
        },
      },
    });
    const { page } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(() => window.fixtureStreams.length === 1);
    assert.equal(
      await page
        .locator(".user-text")
        .filter({ hasText: "Inspect this project." })
        .count(),
      1,
    );
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [
          {
            id: "native-real-user-1",
            type: "userMessage",
            turn_id: "native-turn-1",
            status: "completed",
            text: "Inspect this project.",
            data: {
              content: [{ type: "text", text: "Inspect this project." }],
            },
          },
        ],
        remove: ["native-input-client-message-1"],
        state: { turn_id: "native-turn-1", status: "inProgress" },
      }),
    );
    await page.locator('[data-id="native-real-user-1"]').waitFor();
    assert.equal(
      await page.locator('[data-id="native-input-client-message-1"]').count(),
      0,
      "removed native optimistic message leaked into history",
    );
    assert.equal(
      await page
        .locator(".user-text")
        .filter({ hasText: "Inspect this project." })
        .count(),
      1,
      "hydration duplicated the same native user input",
    );
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        reset: true,
        items: [
          {
            id: "native-real-user-1",
            type: "userMessage",
            turn_id: "native-turn-1",
            text: "Inspect this project.",
          },
        ],
        remove: [],
        state: {
          turn_id: "native-turn-1",
          context: {
            used_tokens: 1000,
            window_tokens: 128000,
            compaction: { status: "completed", id: "native-compact" },
          },
        },
      }),
    );
    await page
      .getByText("Working on the first turn.", { exact: true })
      .waitFor();
    await page
      .getByText("Keep the earlier response.", { exact: true })
      .waitFor();
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        reset: true,
        items: [
          {
            id: "native-input-client-message-2",
            type: "userMessage",
            turn_id: "native-turn-2",
            text: "A second task.",
          },
          {
            id: "native-answer-2",
            type: "agentMessage",
            turn_id: "native-turn-2",
            text: "The second turn is running.",
          },
        ],
        remove: [],
        state: { turn_id: "native-turn-2", status: "inProgress" },
      }),
    );
    await page.getByText("Inspect this project.", { exact: true }).waitFor();
    await page
      .getByText("Working on the first turn.", { exact: true })
      .waitFor();
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        reset: true,
        items: [
          {
            id: "native-real-user-2",
            type: "userMessage",
            turn_id: "native-turn-2",
            text: "A second task.",
          },
          {
            id: "native-answer-2",
            type: "agentMessage",
            turn_id: "native-turn-2",
            text: "The second turn is running.",
          },
        ],
        remove: ["native-input-client-message-2"],
        state: { turn_id: "native-turn-2" },
      }),
    );
    assert.equal(
      await page.locator('[data-id="native-input-client-message-2"]').count(),
      0,
      "reset hydration kept a duplicate optimistic user input",
    );
    assert.equal(
      await page
        .locator(".user-text")
        .filter({ hasText: "A second task." })
        .count(),
      1,
    );
    await f.clean();
  });

  test(`${engine}: native history connection is localized, explicit and retryable without losing the draft`, async (t) => {
    let release;
    const pending = new Promise((resolve) => (release = resolve));
    const connected = {
      kind: "native",
      state: "connected",
      epoch: "localized-owner",
      capabilities: { send: true, configure: true },
    };
    const f = await fixture(t, engine, {
      locale: "zh-CN",
      streaming: true,
      rows: [{ ...session, source: "codex-app" }],
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        connectError: "Codex is still opening this conversation.",
        live: { status: "idle", owner: connected, items: [], requests: [] },
      },
      beforeConnect: () => pending,
      onConnect(state) {
        state.live = { ...state.live, owner: connected };
      },
    });
    const { page, seen, state } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(() => window.fixtureStreams.length === 1);
    await page.locator("#message").fill("连接时保留草稿");
    await page
      .locator("#fileInput")
      .setInputFiles({
        name: "draft.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("attached draft"),
      });
    await page.locator("#attachments .attachment-chip").waitFor();
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [],
        state: {
          status: "unknown",
          owner: {
            kind: "native",
            state: "observing",
            notice:
              "Connect this conversation in the local Codex app to continue it.",
            capabilities: { connect: true },
          },
        },
      }),
    );
    assert.match(
      await page.locator("#ownerNotice").innerText(),
      /更新.*agentTools/,
    );
    assert(await page.locator("#connectOwner").isHidden());
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [],
        state: {
          owner: {
            kind: "native",
            state: "observing",
            notice:
              "History is available. Connect this conversation in the local Codex app to continue; this may switch the local conversation.",
            capabilities: { connect: true },
          },
        },
      }),
    );
    assert.match(
      await page.locator("#ownerNotice").innerText(),
      /更新.*agentTools/,
    );
    await page.locator("#connectOwner").dispatchEvent("click");
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/connect")).length,
      0,
    );
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [],
        state: {
          owner: {
            kind: "native",
            state: "observing",
            notice:
              "Open this conversation in the original VS Code window to continue it.",
            capabilities: { connect: false },
          },
        },
      }),
    );
    assert.equal(
      await page.locator("#ownerNotice").innerText(),
      "请在原 VS Code 窗口中打开此会话后继续。",
    );
    assert(await page.locator("#connectOwner").isHidden());
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [],
        state: {
          owner: {
            kind: "native",
            state: "observing",
            notice:
              "History is available. Connect this conversation in the background to continue without switching the desktop chat.",
            capabilities: { connect: true, background_connect: true },
          },
        },
      }),
    );
    assert.equal(
      await page.locator("#connectionLabel").innerText(),
      "Codex 控制尚未连接",
    );
    assert(await page.locator("#send").isDisabled());
    await screenshot(
      page,
      `workspace-native-history-connection-${engine}-1440.png`,
    );
    const click = page.locator("#connectOwner").click();
    await page.locator("#connectOwner").filter({ hasText: "连接中" }).waitFor();
    assert(await page.locator("#connectOwner").isDisabled());
    assert.match(await page.locator("#ownerNotice").innerText(), /正在.*连接/);
    await page.locator("#connectOwner").dispatchEvent("click");
    release();
    await click;
    await page
      .locator("#notice")
      .filter({ hasText: "Codex 仍在打开此会话" })
      .waitFor();
    await page
      .locator("#connectOwner")
      .filter({ hasText: "重试连接" })
      .waitFor();
    assert.match(await page.locator("#ownerNotice").innerText(), /请重试连接/);
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/connect")).length,
      1,
    );
    assert.equal(
      seen.posts.find((post) => post.path.endsWith("/connect")).data.executor,
      "background",
    );
    state.connectError = "";
    await page.locator("#connectOwner").click();
    await page.locator("#connectOwner").waitFor({ state: "hidden" });
    assert(await page.locator("#send").isEnabled());
    assert.equal(await page.locator("#message").inputValue(), "连接时保留草稿");
    assert.equal(
      await page.locator("#attachments .attachment-chip").count(),
      1,
    );
    assert.deepEqual(seen.deletes, []);
    assert.equal(
      seen.posts.filter(
        (post) => post.path === "/api/threads" || post.path.endsWith("/turn"),
      ).length,
      0,
    );
    await f.clean();
  });

  for (const archivedVia of ["list", "detail", "stream"])
    test(`${engine}: ${archivedVia} archive removes the selected conversation and preserves its unsent draft`, async (t) => {
      const owner = {
        kind: "native",
        state: "connected",
        epoch: "archive-owner",
        capabilities: { send: true, configure: true, queue: true },
      };
      const f = await fixture(t, engine, {
        streaming: true,
        rows: [{ ...session, source: "codex-app" }],
        catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
        state: { live: { status: "idle", owner, items: [], requests: [] } },
      });
      const { page, state, seen } = f;
      await page.locator('#sessions button[data-id="remote-rich"]').click();
      await page.waitForFunction(() => window.fixtureStreams.length === 1);
      await page.locator("#message").fill("Keep archived draft");
      await page
        .locator("#fileInput")
        .setInputFiles({
          name: "draft.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("attached draft"),
        });
      await page.locator("#attachments .attachment-chip").waitFor();
      // A missing row can be pagination or a folder filter, so only explicit archive evidence may clear selection.
      state.rows = [];
      await page.locator("#refresh").click();
      assert.equal(await page.locator("#title").innerText(), session.title);
      assert(await page.locator("#send").isEnabled());
      if (archivedVia === "list") {
        state.archivedIDs = [session.id];
        await page.locator("#refresh").click();
      } else if (archivedVia === "detail") {
        state.archivedDetail = true;
        await page.locator("#refresh").click();
      } else
        await page.evaluate(
          (id) => window.fixtureStreams[0].emitEvent("archived", { id }),
          session.id,
        );
      await page
        .locator("#ownerNotice")
        .filter({ hasText: "archived" })
        .waitFor();
      assert.equal(
        await page.locator("#title").innerText(),
        "Archived conversation",
      );
      assert(await page.locator("#send").isDisabled());
      assert.equal(
        await page.locator('#sessions button[data-id="remote-rich"]').count(),
        0,
      );
      assert(await page.locator("#openCodex").isHidden());
      assert.equal(
        await page.locator("#message").inputValue(),
        "Keep archived draft",
      );
      assert.equal(
        await page.locator("#attachments .attachment-chip").count(),
        1,
      );
      assert.deepEqual(seen.deletes, []);
      if (archivedVia === "stream")
        await screenshot(page, `workspace-native-archived-${engine}-1440.png`);
      assert(await page.evaluate(() => window.fixtureStreams[0].closed));
      await page.evaluate(() =>
        window.fixtureStreams[0].emit({
          items: [
            {
              id: "stale-after-archive",
              type: "agentMessage",
              text: "Must stay hidden",
            },
          ],
          state: {
            owner: {
              kind: "native",
              state: "connected",
              capabilities: { send: true },
            },
          },
        }),
      );
      await page.locator("#composer").dispatchEvent("submit");
      await page.waitForTimeout(20);
      assert(await page.locator("#send").isDisabled());
      assert.equal(
        await page.getByText("Must stay hidden", { exact: true }).count(),
        0,
      );
      assert.equal(
        seen.posts.filter(
          (post) => post.path === "/api/threads" || post.path.endsWith("/turn"),
        ).length,
        0,
      );
      await f.clean();
    });

  for (const unavailableVia of ["list", "detail", "stream"])
    test(`${engine}: ${unavailableVia} unavailable archive state closes live control until an explicit refresh succeeds`, async (t) => {
      const owner = {
        kind: "native",
        state: "connected",
        epoch: "available-owner",
        capabilities: { send: true, configure: true },
      };
      const f = await fixture(t, engine, {
        streaming: true,
        rows: [{ ...session, source: "codex-app" }],
        catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
        state: { live: { status: "idle", owner, items: [], requests: [] } },
      });
      const { page, seen, state } = f;
      await page.locator('#sessions button[data-id="remote-rich"]').click();
      await page.waitForFunction(() => window.fixtureStreams.length === 1);
      await page.locator("#message").fill("Keep uncertain draft");
      if (unavailableVia === "list") {
        state.historyUnavailable = true;
        await page.locator("#refresh").click();
      } else if (unavailableVia === "detail") {
        state.detailHistoryUnavailable = true;
        await page.locator("#refresh").click();
      } else
        await page.evaluate(() =>
          window.fixtureStreams[0].emitEvent("unavailable", {
            error:
              "Cannot read the Codex conversation archive state. Refresh after the local index is available.",
          }),
        );
      await page.waitForFunction(
        () =>
          document.getElementById("send").disabled &&
          window.fixtureStreams[0].closed &&
          !document.getElementById("refresh").disabled,
      );
      const details = seen.details.length;
      await page.clock.fastForward(30000);
      assert.equal(
        seen.details.length,
        details,
        "unknown state caused repeated full-detail requests",
      );
      assert.equal(
        await page.locator("#message").inputValue(),
        "Keep uncertain draft",
      );
      state.historyUnavailable = false;
      state.detailHistoryUnavailable = false;
      await page.locator("#refresh").click();
      await page.waitForFunction(
        () => !document.getElementById("send").disabled,
      );
      assert.equal(await page.evaluate(() => window.fixtureStreams.length), 2);
      await f.clean();
    });

  test(`${engine}: stop binds the observed native turn and never retries after the original owner moves to another turn`, async (t) => {
    const owner = {
      kind: "native",
      state: "connected",
      epoch: "stop-owner-1",
      capabilities: {
        send: true,
        queue: true,
        steer: true,
        interrupt: true,
        answer: true,
        configure: true,
        plan: true,
      },
    };
    const f = await fixture(t, engine, {
      rows: [{ ...session, source: "codex-app" }],
      state: {
        live: {
          status: "inProgress",
          turn_id: "browser-observed-turn",
          owner,
          items: [],
          requests: [],
        },
      },
      onInterrupt(state, data) {
        state.live = {
          ...state.live,
          turn_id: "new-owner-turn",
          status: "inProgress",
        };
        return data.expected_turn_id !== "new-owner-turn"
          ? "The active turn changed. Refresh before stopping."
          : null;
      },
    });
    const { page, seen, state } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.locator("#stop:visible").click();
    await page
      .locator("#notice")
      .filter({ hasText: "The active turn changed. Refresh before stopping." })
      .waitFor();
    const interrupts = seen.posts.filter((post) =>
      post.path.endsWith("/interrupt"),
    );
    assert.equal(interrupts.length, 1);
    assert.deepEqual(interrupts[0].data, {
      expected_turn_id: "browser-observed-turn",
    });
    assert.equal(interrupts[0].ownerEpoch, owner.epoch);
    assert.equal(state.live.turn_id, "new-owner-turn");
    assert.equal(
      state.live.status,
      "inProgress",
      "a late browser stop interrupted the replacement turn",
    );
    await page.waitForTimeout(30);
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/interrupt")).length,
      1,
      "the UI automatically retried a stale stop",
    );
    await f.clean();
  });

  test(`${engine}: native approval modes use three choices and preserve selected permissions in requests`, async (t) => {
    const f = await fixture(t, engine);
    const { page, seen, state } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    assert.match(
      await page.locator("#permission").innerText(),
      /Ask for approval/,
      "the default workspace-write mode should use the native approval label",
    );
    await page.locator("#permission").click();
    const modes = page.locator('#menu [role="menuitemradio"]');
    assert.equal(await modes.count(), 3);
    const labels = await modes.locator(".menu-copy > span").allTextContents();
    assert.deepEqual(labels, [
      "Ask for approval",
      "Approve for me",
      "Full access",
    ]);
    assert.equal(
      await page
        .locator("#menu")
        .getByText("Read only", { exact: true })
        .count(),
      0,
      "legacy read-only must not appear in the native primary modes",
    );
    await page
      .locator("#menu")
      .getByText(catalog.permissions[0].description, { exact: true })
      .waitFor();
    await page
      .locator("#menu")
      .getByText(catalog.permissions[1].description, { exact: true })
      .waitFor();
    await page
      .locator("#menu")
      .getByText(catalog.permissions[2].description, { exact: true })
      .waitFor();
    await screenshot(page, `workspace-permissions-${engine}-1440.png`);
    await modes.filter({ hasText: "Approve for me" }).click();
    await page
      .locator("#permission")
      .filter({ hasText: "Approve for me" })
      .waitFor();
    assert.match(
      await page.locator("#permission").innerText(),
      /Approve for me/,
    );
    assert.equal(
      await page.locator("#permissionDialog").evaluate((dialog) => dialog.open),
      false,
      "auto-review unexpectedly asked for unrestricted access",
    );
    await page
      .locator("#message")
      .fill("Review the cart using approval assistance.");
    await page.locator("#send").click();
    await page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/turn"),
    );
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/turn")).at(-1).data
        .permission,
      "auto-review",
    );
    await page.locator("#refresh").click();
    assert.match(
      await page.locator("#permission").innerText(),
      /Approve for me/,
      "refresh discarded the selected approval mode",
    );
    await page
      .locator("#message")
      .fill("Keep this assisted follow-up waiting.");
    await page.locator("#send").click();
    await page
      .locator("#queueList .queue-message-text")
      .filter({ hasText: "Keep this assisted follow-up waiting." })
      .waitFor();
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/queue")).at(-1).data
        .permission,
      "auto-review",
    );
    state.live = { ...state.live, status: "completed" };
    await page.locator("#refresh").click();
    await menu(page, "permission", "Full access");
    await page.locator("#permissionDialog[open]").waitFor();
    assert.match(
      await page.locator("#permission").innerText(),
      /Approve for me/,
      "unrestricted access changed before confirmation",
    );
    await page.locator("#cancelPermission").click();
    assert.match(
      await page.locator("#permission").innerText(),
      /Approve for me/,
    );
    await menu(page, "permission", "Full access");
    await page.locator("#confirmPermission").click();
    await page.locator("#permissionDialog").waitFor({ state: "hidden" });
    assert.match(await page.locator("#permission").innerText(), /Full access/);
    await page.locator("#queueList .queue-remove").click();
    await page
      .locator("#message")
      .fill("Run with explicitly confirmed full access.");
    await page.locator("#send").click();
    await page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/turn"),
    );
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/turn")).at(-1).data
        .permission,
      "full-access",
    );
    state.live = { ...state.live, status: "completed" };
    await page.locator("#refresh").click();
    await menu(page, "permission", "Ask for approval");
    await page.locator("#message").fill("Ask before external actions.");
    await page.locator("#send").click();
    await page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/turn"),
    );
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/turn")).at(-1).data
        .permission,
      "workspace-write",
    );
    await f.clean();
  });

  test(`${engine}: unavailable automatic approval is disabled with its reason and legacy engines retain their menu`, async (t) => {
    const unavailable = catalog.permissions.map((permission) =>
      permission.id === "auto-review"
        ? {
            ...permission,
            available: false,
            reason: "This Codex build does not support automatic review.",
          }
        : permission,
    );
    const f = await fixture(t, engine, {
      catalog: { permissions: unavailable },
    });
    const { page, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.locator("#permission").click();
    const auto = page
      .locator('#menu [role="menuitemradio"]')
      .filter({ hasText: "Approve for me" });
    assert(
      await auto.isDisabled(),
      "an unavailable approval mode remained selectable",
    );
    await page
      .locator("#menu")
      .getByText("This Codex build does not support automatic review.", {
        exact: true,
      })
      .waitFor();
    await auto.dispatchEvent("click");
    assert.match(
      await page.locator("#permission").innerText(),
      /Ask for approval/,
    );
    await page.keyboard.press("Escape");
    await page.locator("#message").fill("Use the supported approval mode.");
    await page.locator("#send").click();
    await page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/turn"),
    );
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/turn")).at(-1).data
        .permission,
      "workspace-write",
    );
    await f.clean();

    const legacy = await fixture(t, engine, {
      catalog: {
        capabilities: { ...catalog.capabilities, approval_modes: false },
        permissions: [
          { id: "read-only", name: "Read only" },
          { id: "workspace-write", name: "Workspace access" },
          { id: "full-access", name: "Full access" },
        ],
      },
    });
    await legacy.page
      .locator('#sessions button[data-id="remote-rich"]')
      .click();
    await legacy.page.locator("#permission").click();
    assert.deepEqual(
      await legacy.page.locator("#menu .menu-copy > span").allTextContents(),
      ["Read only", "Workspace access", "Full access"],
    );
    await legacy.page
      .locator('#menu [role="menuitemradio"]')
      .filter({ hasText: "Read only" })
      .click();
    await legacy.page
      .locator("#permission")
      .filter({ hasText: "Read only" })
      .waitFor();
    await legacy.page
      .locator("#message")
      .fill("Use the legacy read-only mode.");
    await legacy.page.locator("#send").click();
    await legacy.page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/turn"),
    );
    assert.equal(
      legacy.seen.posts.filter((post) => post.path.endsWith("/turn")).at(-1)
        .data.permission,
      "read-only",
    );
    await legacy.clean();
  });

  test(`${engine}: background creation inherits actual App preferences unless the new draft explicitly overrides them`, async (t) => {
    const actual = {
      model: "codex-fast",
      effort: "high",
      mode: "plan",
      permission: "full-access",
    };
    const owner = {
      kind: "native",
      state: "connected",
      epoch: "inherited-app-owner",
      capabilities: { send: true, configure: true },
    };
    for (const entry of ["send", "new", "new-from-existing", "explicit"]) {
      const created = {
        ...session,
        id: "app-created-" + entry,
        source: "codex-app",
      };
      const f = await fixture(t, engine, {
        state: { sessionOptions: { ...defaults, permission: "read-only" } },
        onCreate(state, data) {
          state.sessionOptions = {
            ...actual,
            ...Object.fromEntries(
              ["model", "effort", "mode", "permission"]
                .filter((key) => data[key] !== undefined)
                .map((key) => [key, data[key]]),
            ),
          };
          state.rows = [...state.rows, created];
          state.live = { status: "idle", items: [], requests: [], owner };
          return created;
        },
        onTurn(state) {
          state.live = {
            ...state.live,
            status: "completed",
            turn_id: "app-inherited-turn",
          };
        },
      });
      const { page, seen } = f;
      assert.match(
        await page.locator("#permission").innerText(),
        /Use Codex App settings/,
        "new draft presented configured workspace access as actual App permissions",
      );
      if (entry === "new-from-existing") {
        await page.locator('#sessions button[data-id="remote-rich"]').click();
        await page
          .locator("#permission")
          .filter({ hasText: "Read only" })
          .waitFor();
      } else if (entry === "explicit") {
        await menu(page, "model", "Codex Main");
        await menu(page, "effort", "High");
        await menu(page, "mode", "Default mode");
        await menu(page, "permission", "Ask for approval");
      }
      await page
        .locator("#message")
        .fill("Use the original App preferences for this conversation.");
      const createdResponse = page.waitForResponse(
          (response) => new URL(response.url()).pathname === "/api/threads",
        ),
        turnResponse =
          entry === "send" || entry === "explicit"
            ? page.waitForResponse((response) =>
                new URL(response.url()).pathname.endsWith("/turn"),
              )
            : null;
      await page.locator(entry.startsWith("new") ? "#new" : "#send").click();
      await createdResponse;
      if (turnResponse) await turnResponse;
      await page
        .locator("#permission")
        .filter({
          hasText: entry === "explicit" ? "Ask for approval" : "Full access",
        })
        .waitFor();
      const creation = seen.posts.find(
        (post) => post.path === "/api/threads",
      ).data;
      assert.deepEqual(
        creation,
        {
          project,
          executor: "background",
          ...(entry === "explicit"
            ? {
                model: "codex-main",
                effort: "high",
                mode: "default",
                permission: "workspace-write",
              }
            : {}),
        },
        "new background creation forwarded defaults or cached settings without user selection",
      );
      if (entry === "send" || entry === "explicit")
        assert.deepEqual(
          seen.posts.find((post) => post.path.endsWith("/turn")).data,
          { text: "Use the original App preferences for this conversation." },
          "first native turn replaced original App settings",
        );
      if (entry !== "explicit") {
        assert.match(await page.locator("#model").innerText(), /Codex Fast/);
        assert.match(await page.locator("#mode").innerText(), /Plan mode/);
      }
      await f.clean();
    }
  });

  test(`${engine}: configured defaults never replace existing native and legacy session permissions`, async (t) => {
    for (const permission of ["auto-review", "full-access"]) {
      const existing = await fixture(t, engine, {
        catalog: { defaults: { ...defaults, permission } },
        state: { sessionOptions: { ...defaults, permission: "read-only" } },
      });
      await existing.page
        .locator('#sessions button[data-id="remote-rich"]')
        .click();
      await existing.page
        .locator("#permission")
        .filter({ hasText: "Read only" })
        .waitFor();
      assert.match(
        await existing.page.locator("#permission").innerText(),
        /Read only/,
        "configured approval default widened an existing legacy session",
      );
      await existing.page
        .locator("#message")
        .fill("Keep this existing task read only.");
      await existing.page.locator("#send").click();
      await existing.page.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith("/turn"),
      );
      assert.equal(
        existing.seen.posts.find((post) => post.path.endsWith("/turn")).data
          .permission,
        "read-only",
      );
      await existing.clean();

      const nativeHistory = await fixture(t, engine, {
        rows: [{ ...session, source: "codex-app" }],
        catalog: { defaults: { ...defaults, permission } },
        state: {
          sessionOptions: {},
          live: {
            status: "idle",
            items: [],
            requests: [],
            owner: {
              kind: "native",
              state: "connected",
              epoch: "custom-owner",
              capabilities: { send: true, configure: true },
            },
          },
        },
        onTurn(state) {
          state.live = {
            ...state.live,
            status: "completed",
            turn_id: "custom-native-turn",
          };
        },
      });
      await nativeHistory.page
        .locator('#sessions button[data-id="remote-rich"]')
        .click();
      await nativeHistory.page
        .locator("#permission")
        .filter({ hasText: "Custom permissions" })
        .waitFor();
      await nativeHistory.page
        .locator("#message")
        .fill("Continue after I choose an explicit approval mode.");
      assert(
        await nativeHistory.page.locator("#send").isEnabled(),
        "the original owner must be able to continue with its actual custom permissions",
      );
      const initialTurn = nativeHistory.page.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith("/turn"),
      );
      await nativeHistory.page.locator("#send").click();
      await initialTurn;
      assert.deepEqual(
        nativeHistory.seen.posts.find((post) => post.path.endsWith("/turn"))
          .data,
        { text: "Continue after I choose an explicit approval mode." },
        "custom native continuation silently applied configured default permissions",
      );
      nativeHistory.state.live = {
        ...nativeHistory.state.live,
        status: "completed",
      };
      await nativeHistory.page.locator("#refresh").click();
      await nativeHistory.page
        .locator("#permission")
        .filter({ hasText: "Custom permissions" })
        .waitFor();
      await nativeHistory.page.locator("#permission").click();
      assert.equal(
        await nativeHistory.page.locator('#menu [aria-checked="true"]').count(),
        0,
        "custom permissions falsely selected a built-in mode",
      );
      await nativeHistory.page
        .locator("#menu")
        .getByText("Ask for approval", { exact: true })
        .click();
      await nativeHistory.page
        .locator("#permission")
        .filter({ hasText: "Ask for approval" })
        .waitFor();
      assert.deepEqual(
        nativeHistory.seen.posts.find((post) =>
          post.path.endsWith("/settings"),
        ),
        {
          path: "/api/threads/remote-rich/settings",
          data: { permission: "workspace-write" },
          ownerEpoch: "custom-owner",
        },
      );
      await nativeHistory.page
        .locator("#message")
        .fill("Continue with owner-confirmed workspace permissions.");
      await nativeHistory.page.locator("#send").click();
      assert.equal(
        nativeHistory.seen.posts.find((post) => post.path.endsWith("/turn"))
          .data.permission,
        undefined,
        "native send should inherit owner-confirmed settings instead of overriding them",
      );
      await nativeHistory.clean();
    }
  });

  test(`${engine}: workspace options, attachments, references, activity, changes, queued steering and native dialogs`, async (t) => {
    const requests = [
      {
        id: 41,
        method: "item/commandExecution/requestApproval",
        params: {
          command: "npm test -- cart",
          reason: "Run cart tests",
          availableDecisions: ["decline", "acceptForSession"],
        },
      },
      {
        id: 42,
        method: "item/commandExecution/requestApproval",
        params: {
          command: "git status",
          availableDecisions: [
            {
              acceptWithExecpolicyAmendment: {
                execpolicy_amendment: ["git", "status"],
              },
            },
          ],
        },
      },
      {
        id: 43,
        method: "item/commandExecution/requestApproval",
        params: {
          command: "curl https://docs.example.test",
          availableDecisions: [
            {
              applyNetworkPolicyAmendment: {
                network_policy_amendment: {
                  host: "docs.example.test",
                  action: "allow",
                },
              },
            },
          ],
        },
      },
      {
        id: "choice",
        method: "item/tool/requestUserInput",
        params: {
          questions: [
            {
              id: "scope",
              header: "Scope",
              question: "Which checkout?",
              options: [
                { label: "Cart", description: "Update the cart page" },
                { label: "Both", description: "Cart and payment" },
              ],
            },
          ],
        },
      },
      {
        id: "mcp-form",
        method: "mcpServer/elicitation/request",
        params: {
          mode: "form",
          message: "Choose documentation to inspect",
          requestedSchema: {
            type: "object",
            required: ["channel", "areas"],
            properties: {
              channel: {
                type: "string",
                title: "Channel",
                enum: ["stable", "preview"],
                enumNames: ["Stable documentation", "Preview documentation"],
              },
              areas: {
                type: "array",
                title: "Areas",
                minItems: 2,
                maxItems: 2,
                items: {
                  type: "string",
                  oneOf: [
                    { const: "cart", title: "Cart guides" },
                    { const: "payment", title: "Payment guides" },
                  ],
                },
              },
              retries: {
                type: "integer",
                title: "Retries",
                minimum: 0,
                maximum: 5,
                default: 2,
              },
              includeExamples: {
                type: "boolean",
                title: "Include examples",
                default: true,
              },
            },
          },
        },
      },
    ];
    const f = await fixture(t, engine, {
      state: { sessionOptions: { ...defaults, permission: "read-only" } },
      onAnswer(state) {
        requests.shift();
        state.live.requests = requests.length ? [requests[0]] : [];
        if (!requests.length) state.live.status = "completed";
      },
    });
    const { page, seen, state } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page
      .locator("#cwd")
      .filter({ hasText: project })
      .waitFor({ state: "attached" });
    await menu(page, "model", "Codex Fast");
    assert.match(await page.locator("#effort").innerText(), /Low/);
    await menu(page, "effort", "High");
    await menu(page, "effort", "Default effort");
    assert.match(
      await page.locator("#effort").innerText(),
      /Low/,
      "model default effort was not restored",
    );
    await menu(page, "model", "Configured model");
    assert.match(
      await page.locator("#model").innerText(),
      /Codex Main/,
      "configured model was not restored",
    );
    assert.match(
      await page.locator("#effort").innerText(),
      /Medium/,
      "configured effort was not restored",
    );
    await menu(page, "model", "Codex Fast");
    await menu(page, "effort", "High");
    await menu(page, "mode", "Plan mode");
    await menu(page, "permission", "Full access");
    await page.locator("#permissionDialog[open]").waitFor();
    assert(
      !/Full access/.test(await page.locator("#permission").innerText()),
      "full access changed before consent",
    );
    await page.locator("#cancelPermission").click();
    assert.match(
      await page.locator("#permission").innerText(),
      /Read only/,
      "a legacy read-only session must keep its permission when full access is cancelled",
    );
    await page.locator("#fileInput").setInputFiles([
      {
        name: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("cart context\n"),
      },
      {
        name: "cart.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/hUAAAAASUVORK5CYII=",
          "base64",
        ),
      },
    ]);
    await page.locator("#attachments .attachment-chip").nth(1).waitFor();
    const removedAttachment = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/attachments/upload-1" &&
        response.request().method() === "DELETE",
    );
    await page
      .locator("#attachments")
      .getByRole("button", { name: "Remove attachment notes.txt", exact: true })
      .click();
    await removedAttachment;
    assert.deepEqual(seen.deletes, ["upload-1"]);
    assert.deepEqual(
      seen.uploads.map((upload) => upload.value.name),
      ["notes.txt", "cart.png"],
    );
    assert.match(
      seen.uploads[0].body,
      /cart context/,
      "encrypted multipart upload lost file bytes",
    );
    await page.locator("#message").fill("@src");
    await page
      .locator("#suggestions button")
      .filter({ hasText: "src/cart.ts" })
      .click();
    await page.locator("#message").fill("/repo-style");
    await page
      .locator("#suggestions button")
      .filter({ hasText: "repo-style" })
      .click();
    await page.locator("#message").fill("/docs/lookup");
    await page
      .locator("#suggestions button")
      .filter({ hasText: "docs/lookup" })
      .click();
    assert.deepEqual(seen.files.at(-1), {
      project,
      thread: session.id,
      q: "src",
    });
    assert.equal(
      await page.locator("#attachments .attachment-chip").count(),
      4,
    );
    await page
      .locator("#message")
      .fill("Improve the cart using these references.");
    await page.locator("#send").click();
    const batch = page.locator("#live .tool-batch");
    await batch.waitFor();
    assert.equal(
      await batch.count(),
      1,
      "consecutive command and tool calls should render as one batch",
    );
    assert.equal(
      await batch.locator(".tool-batch-item").count(),
      2,
      "the batch must retain both original calls",
    );
    assert.equal(
      await batch.evaluate((node) => node.open),
      false,
      "completed batches should start collapsed",
    );
    await batch.locator(":scope > summary").click();
    await screenshot(page, `workspace-tool-batch-${engine}-1440.png`);
    await page.locator("#live .command").waitFor({ state: "attached" });
    const start = seen.posts.find((p) => p.path.endsWith("/turn")).data;
    assert.deepEqual(start, {
      text: "Improve the cart using these references.",
      attachments: ["upload-2"],
      skills: [{ name: "repo-style", path: catalog.skills[0].path }],
      mentions: [{ name: "cart.ts", path: project + "/src/cart.ts" }],
      tools: [{ server: "docs", name: "lookup" }],
      model: "codex-fast",
      effort: "high",
      mode: "plan",
      permission: "read-only",
    });
    assert(await page.locator("#model").isDisabled());
    assert.equal(
      await page.locator("#attachments .attachment-chip").count(),
      0,
    );
    await page.locator("#live .thinking summary").click();
    await page
      .getByText("Inspecting cart state and existing tests.", { exact: true })
      .waitFor();
    await page.locator("#live .command summary").click();
    await page.getByText("cart.test.ts: 3 passed", { exact: true }).waitFor();
    assert.match(
      await page.locator("#live .command").innerText(),
      /Exit code 0/,
    );
    assert.equal(
      await page.locator("#live .markdown h1").innerText(),
      "Cart update",
    );
    assert.equal(
      await page.locator("#live .markdown table td").first().innerText(),
      "Cart",
    );
    assert.equal(await page.locator("#live .markdown img").count(), 0);
    const nativeUser = await page
      .locator('#live [data-id="user-1"] .user-text')
      .innerText();
    assert.equal(
      nativeUser,
      "Improve the cart",
      "generated attachment instructions leaked into the user prompt",
    );
    const nativeBubble = await page
      .locator('#live [data-id="user-1"]')
      .innerText();
    for (const helper of [
      "User attached file",
      "User referenced",
      "Read this file",
      "user selected",
      attachmentPath,
      "/Users/fixture/",
      "data:image/",
    ])
      assert(
        !nativeBubble.includes(helper),
        `user bubble exposed implementation text: ${helper}`,
      );
    const chips = await page
      .locator('#live [data-id="user-1"] .message-user-attachments .file-name')
      .allTextContents();
    assert(
      chips.includes(attachedName),
      "original quoted filename was not preserved as an attachment chip",
    );
    assert(
      chips.includes("cart.ts"),
      "project reference filename was not rendered",
    );
    assert(chips.includes("repo-style"), "skill name was not rendered");
    assert(
      chips.some((name) => name.includes("docs") && name.includes("lookup")),
      "MCP tool name was not rendered",
    );
    assert.equal(
      await page
        .locator('#live [data-id="user-quoted"] .message-body')
        .innerText(),
      quotedUserText,
      "user-authored prose containing helper phrases was altered",
    );
    await page.waitForFunction(() => {
      const image = document.querySelector("#live .user img");
      return image?.complete && image.naturalWidth > 0;
    });
    assert.equal(await page.locator('#live a[href^="javascript:"]').count(), 0);
    assert.equal(await page.evaluate(() => window.remoteXSS), undefined);
    await page.getByText("Update cart tests", { exact: true }).waitFor();
    state.historyItems = [
      {
        id: "older-change",
        type: "fileChange",
        turn_id: "older-turn",
        data: {
          changes: [{ path: "src/cart.ts", diff: patch("original", "before") }],
        },
      },
    ];
    await page.locator("#refresh").click();
    await page.locator("#changesToggle").click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll("#changesContent .diff-file").length === 2,
    );
    assert.equal(
      await page.locator("#changeCount").innerText(),
      "1",
      "same-path changes should count as one file",
    );
    assert.match(await page.locator("#changesContent").innerText(), /original/);
    assert.match(await page.locator("#changesContent").innerText(), /final/);
    assert(
      !/intermediate/.test(await page.locator("#changesContent").innerText()),
      "current aggregate should replace partial current-turn patch",
    );
    await screenshot(page, `workspace-rich-${engine}-1440.png`);
    await page.locator("#closeChanges").click();
    await screenshot(page, `workspace-chat-${engine}-1440.png`);
    await page.locator("#message").fill("Also keep keyboard navigation.");
    await page.locator("#send").click();
    await page
      .locator("#queueList .queue-message-text")
      .filter({ hasText: "Also keep keyboard navigation." })
      .waitFor();
    assert.equal(
      seen.posts.filter((p) => p.path.endsWith("/steer")).length,
      0,
      "sending an active-turn message must wait for an explicit steer action",
    );
    const { request_id: followUpID, ...followUp } = seen.posts.find((p) =>
      p.path.endsWith("/queue"),
    ).data;
    assert.match(
      followUpID,
      /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i,
      "enqueue must include an idempotency request ID",
    );
    assert.deepEqual(followUp, {
      text: "Also keep keyboard navigation.",
      model: "codex-fast",
      effort: "high",
      mode: "plan",
      permission: "read-only",
    });
    await page.locator("#queueList .queue-steer").click();
    await page
      .locator("#live")
      .getByText("Also keep keyboard navigation.", { exact: true })
      .waitFor();
    assert.deepEqual(
      seen.posts.find((p) => p.path.endsWith("/queue/queue-1/steer")).data,
      { expected_turn_id: "turn-1" },
      "explicit queued steering must bind the visible turn without resending saved contents",
    );
    state.live.requests = [requests[0]];
    await page.locator("#refresh").click();
    await page.locator("#requestDialog[open]").waitFor();
    await page
      .getByRole("button", { name: "Approve for this session", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Approve this command rule", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Approve network rule", exact: true })
      .click();
    await page.getByText("Which checkout?", { exact: true }).waitFor();
    await page.locator("#dismissRequest").click();
    await page.locator("#pendingRequest:visible").waitFor();
    assert.equal(
      await page.locator("#requestDialog").evaluate((d) => d.open),
      false,
    );
    await page.locator("#pendingRequest").click();
    await page.locator("#requestDialog[open]").waitFor();
    await page.locator('#requests input[name="scope"][value="Cart"]').check();
    await page
      .getByRole("button", { name: "Submit answer", exact: true })
      .click();
    await page
      .getByText("Choose documentation to inspect", { exact: true })
      .waitFor();
    await page.locator('#requests input[name="channel"][value="1"]').check();
    await page.locator('#requests input[name="areas"][value="0"]').check();
    await page.locator('#requests input[name="areas"][value="1"]').check();
    await page
      .getByRole("button", { name: "Submit answer", exact: true })
      .click();
    await page.locator("#requestDialog").waitFor({ state: "hidden" });
    const answers = seen.posts
      .filter((p) => p.path.endsWith("/answer"))
      .map((p) => p.data);
    assert.deepEqual(answers, [
      { id: 41, decision: "acceptForSession" },
      {
        id: 42,
        decision: {
          acceptWithExecpolicyAmendment: {
            execpolicy_amendment: ["git", "status"],
          },
        },
      },
      {
        id: 43,
        decision: {
          applyNetworkPolicyAmendment: {
            network_policy_amendment: {
              host: "docs.example.test",
              action: "allow",
            },
          },
        },
      },
      { id: "choice", answers: { scope: "Cart" } },
      {
        id: "mcp-form",
        decision: "accept",
        content: {
          channel: "preview",
          areas: ["cart", "payment"],
          retries: 2,
          includeExamples: true,
        },
      },
    ]);
    await menu(page, "permission", "Full access");
    await page.locator("#confirmPermission").click();
    await page.locator("#permissionDialog").waitFor({ state: "hidden" });
    await menu(page, "mode", "Default mode");
    await page.locator("#message").fill("Check the final result.");
    await page.locator("#send").click();
    await page.locator("#stop:visible").click();
    await page.locator("#stop").waitFor({ state: "hidden" });
    const last = seen.posts.filter((p) => p.path.endsWith("/turn")).at(-1).data;
    assert.equal(last.permission, "full-access");
    assert.equal(last.mode, "default");
    assert.equal(
      seen.posts.filter((p) => p.path.endsWith("/interrupt")).length,
      1,
    );
    assert.equal(
      await page.locator("#openCodex").getAttribute("href"),
      "codex://threads/remote-rich",
    );
    await f.clean();
  });

  test(`${engine}: native titles update the header and sidebar from details and SSE without catalog reloads`, async (t) => {
    const original = { ...session, title: "New chat", source: "codex-app" },
      second = {
        ...session,
        id: "other-native-title",
        title: "Other conversation",
        source: "codex-app",
      };
    const live = {
      status: "idle",
      items: [],
      requests: [],
      owner: {
        kind: "native",
        state: "connected",
        epoch: "title-owner",
        capabilities: { send: true, configure: true },
      },
    };
    const f = await fixture(t, engine, {
      streaming: true,
      rows: [original, second],
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        threadLives: { [original.id]: { ...live }, [second.id]: { ...live } },
      },
    });
    const { page, seen, state } = f;
    const row = page.locator(
      '#sessions button[data-id="' + original.id + '"] .session-title',
    );
    await page
      .locator('#sessions button[data-id="' + original.id + '"]')
      .click();
    await page.waitForFunction(() => window.fixtureStreams.length === 1);
    state.rows = [{ ...original, title: "Title from native details" }, second];
    await page.locator("#refresh").click();
    await page.waitForFunction(
      () => !document.getElementById("refresh").disabled,
    );
    assert.equal(
      await page.locator("#title").innerText(),
      "Title from native details",
    );
    assert.equal(await row.innerText(), "Title from native details");
    const requests = {
      options: seen.options.length,
      details: seen.details.length,
      lists: seen.lists.length,
    };
    const title = "Fix checkout validation";
    await page.evaluate(
      (title) =>
        window.fixtureStreams[0].emit({
          items: [],
          remove: [],
          state: { title },
        }),
      title,
    );
    assert.equal(await page.locator("#title").innerText(), title);
    assert.equal(await row.innerText(), title);
    assert.equal(await row.locator("..").getAttribute("title"), title);
    assert.deepEqual(
      {
        options: seen.options.length,
        details: seen.details.length,
        lists: seen.lists.length,
      },
      requests,
      "a streamed title triggered a full fetch",
    );
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [],
        remove: [],
        state: { title: "" },
      }),
    );
    assert.equal(
      await page.locator("#title").innerText(),
      title,
      "an empty title erased the native title",
    );
    await page
      .locator("#message")
      .fill("Keep this draft after a naming warning.");
    const posts = seen.posts.length,
      titleNotice =
        "Automatic naming could not be confirmed. You can rename this chat in Codex.";
    await page.evaluate(
      (title_notice) =>
        window.fixtureStreams[0].emit({
          items: [],
          remove: [],
          state: { title_notice },
        }),
      titleNotice,
    );
    assert.equal(await page.locator("#notice").innerText(), titleNotice);
    assert.equal(await page.locator("#state").innerText(), "Ready");
    assert.equal(
      await page.locator("#message").inputValue(),
      "Keep this draft after a naming warning.",
    );
    assert.equal(
      seen.posts.length,
      posts,
      "a naming warning retried the accepted message",
    );
    await page.locator('#sessions button[data-id="' + second.id + '"]').click();
    await page.waitForFunction(() => window.fixtureStreams.length === 2);
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [],
        remove: [],
        state: { title: "Stale title" },
      }),
    );
    assert.equal(
      await page.locator("#title").innerText(),
      second.title,
      "a stale stream renamed the current conversation",
    );
    assert.equal(await row.innerText(), title);
    await f.clean();
  });

  test(`${engine}: live stream shows partial output, reconnects, reuses the connection and isolates sessions`, async (t) => {
    const second = {
      ...session,
      id: "remote-second",
      title: "Second conversation",
    };
    const f = await fixture(t, engine, {
      streaming: true,
      rows: [session, second],
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        live: {
          status: "inProgress",
          turn_id: "stream-turn-1",
          items: [],
          requests: [],
        },
      },
      onTurn(state) {
        state.live = {
          status: "inProgress",
          turn_id: "stream-turn-2",
          items: [],
          requests: [],
        };
      },
    });
    const { page, seen } = f;
    const emit = (index, packet) =>
      page.evaluate(
        ({ index, packet }) => window.fixtureStreams[index].emit(packet),
        { index, packet },
      );
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(() => window.fixtureStreams.length === 1);
    const url = new URL(
      await page.evaluate(() => window.fixtureStreams[0].url),
    );
    assert.equal(url.origin, "https://remote.test");
    assert.equal(url.pathname, "/api/sessions/remote-rich/events");
    assert.equal(url.search, "");
    assert.equal(
      url.hash,
      "",
      "stream URL must authenticate with the browser cookie, without secrets in its URL",
    );
    await page.evaluate(() => window.fixtureStreams[0].open());
    await emit(0, {
      reset: true,
      items: [],
      remove: [],
      state: {
        status: "inProgress",
        turn_id: "stream-turn-1",
        requests: [],
        activity: "reasoning",
      },
    });
    const answer = {
      id: "stream-answer",
      type: "agentMessage",
      turn_id: "stream-turn-1",
      status: "inProgress",
      text: "First visible token",
    };
    await emit(0, { items: [answer], remove: [] });
    await page.getByText("First visible token", { exact: true }).waitFor();
    assert.equal(
      await page.locator("#state").innerText(),
      "Running",
      "the first answer must be visible before turn completion",
    );
    assert(await page.locator("#stop").isVisible());
    const command = {
      id: "stream-command",
      type: "commandExecution",
      turn_id: "stream-turn-1",
      status: "inProgress",
      data: {
        command: "npm test -- cart",
        cwd: project,
        aggregatedOutput: "Starting cart tests\n",
      },
    };
    const tool = {
      id: "stream-tool",
      type: "dynamicToolCall",
      turn_id: "stream-turn-1",
      status: "inProgress",
      data: {
        name: "read_file",
        arguments: { path: "src/cart.ts" },
        result: "cart source",
      },
    };
    const thinking = {
      id: "stream-thinking",
      type: "reasoning",
      turn_id: "stream-turn-1",
      status: "inProgress",
      text: "Inspecting one file",
    };
    await emit(0, {
      items: [command, tool, thinking],
      remove: [],
      state: { activity: "commandExecution" },
    });
    await page.getByText("Starting cart tests", { exact: true }).waitFor();
    const batch = page.locator("#live .tool-batch");
    assert.equal(await batch.count(), 1);
    assert.equal(await batch.locator(".tool-batch-item").count(), 2);
    assert.equal(
      await batch.evaluate((node) => node.open),
      true,
      "a running tool batch should open to show current output",
    );
    await page.locator('#live [data-id="stream-command"] summary').click();
    assert.equal(
      await page
        .locator('#live [data-id="stream-command"]')
        .evaluate((node) => node.open),
      false,
    );
    await page.locator('#live [data-id="stream-thinking"] summary').click();
    await page.getByText("Inspecting one file", { exact: true }).waitFor();
    answer.text += " and the next token";
    command.data.aggregatedOutput += "One test passed\n";
    tool.data.result = "latest cart source";
    thinking.text += ", then another";
    const detailCount = seen.details.length;
    await emit(0, { items: [answer, command, tool, thinking], remove: [] });
    await page
      .getByText("First visible token and the next token", { exact: true })
      .waitFor();
    await page
      .getByText("Inspecting one file, then another", { exact: true })
      .waitFor();
    assert.equal(
      await batch.evaluate((node) => node.open),
      true,
      "stream updates closed the expanded tool batch",
    );
    assert.equal(
      await page
        .locator('#live [data-id="stream-command"]')
        .evaluate((node) => node.open),
      false,
      "stream updates changed the nested call expansion state",
    );
    await page.locator('#live [data-id="stream-command"] summary').click();
    assert.match(
      await page
        .locator('#live [data-id="stream-command"] .command-output')
        .innerText(),
      /Starting cart tests\nOne test passed/,
    );
    assert.equal(
      await page.locator('#live [data-id="stream-answer"]').count(),
      1,
      "answer chunks created duplicate messages",
    );
    await page.clock.fastForward(4000);
    assert.equal(
      seen.details.length,
      detailCount,
      "active streaming must not repeatedly fetch full session details",
    );
    await page.evaluate(() => window.fixtureStreams[0].fail());
    assert.equal(
      await page.locator("#connectionLabel").innerText(),
      "Reconnecting live updates…",
    );
    assert.equal(await page.locator("#state").innerText(), "Running");
    assert.equal(
      await page.evaluate(() => window.fixtureStreams[0].closed),
      false,
      "a reconnectable error closed the browser retry connection",
    );
    assert.equal(
      await page
        .locator('#live [data-id="stream-answer"] .markdown')
        .innerText(),
      "First visible token and the next token",
    );
    await emit(0, {
      reset: true,
      items: [answer, command, tool, thinking],
      remove: [],
      state: {
        status: "inProgress",
        turn_id: "stream-turn-1",
        requests: [],
        activity: "commandExecution",
      },
    });
    assert.equal(
      await page.locator("#connectionLabel").innerText(),
      "Live updates",
    );
    assert.equal(
      await page.locator('[data-id="stream-answer"]').count(),
      1,
      "reconnect reset duplicated the existing answer",
    );
    await emit(0, {
      items: [{ ...answer, status: "completed" }],
      remove: [],
      state: { status: "completed" },
    });
    await page.locator("#stop").waitFor({ state: "hidden" });
    await page.locator("#message").fill("Start a second streaming turn.");
    await page.locator("#send").click();
    await page.waitForFunction(
      () =>
        !document.getElementById("refresh").disabled &&
        !document.getElementById("stop").hidden &&
        document.getElementById("message").value === "",
    );
    await emit(0, {
      reset: true,
      items: [
        {
          id: "second-turn-answer",
          type: "agentMessage",
          text: "New turn live output",
        },
      ],
      remove: [],
      state: { status: "inProgress", turn_id: "stream-turn-2", requests: [] },
    });
    await page.getByText("New turn live output", { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => window.fixtureStreams.length),
      1,
      "a new turn opened a second stream for the same conversation",
    );
    assert.equal(
      await page.locator('[data-id="stream-answer"]').count(),
      1,
      "new turn discarded the previous streamed answer",
    );
    await page.locator('#sessions button[data-id="remote-second"]').click();
    await page.waitForFunction(() => window.fixtureStreams.length === 2);
    assert.equal(
      await page.evaluate(() => window.fixtureStreams[0].closed),
      true,
      "switching sessions leaked the old stream",
    );
    await emit(1, {
      reset: true,
      items: [
        {
          id: "second-session-answer",
          type: "agentMessage",
          text: "Current second conversation",
        },
      ],
      remove: [],
      state: {
        status: "inProgress",
        turn_id: "second-session-turn",
        requests: [],
      },
    });
    await emit(0, {
      items: [
        {
          id: "late-old-answer",
          type: "agentMessage",
          text: "Late old conversation output",
        },
      ],
      remove: [],
      state: { status: "completed" },
    });
    await page
      .getByText("Current second conversation", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByText("Late old conversation output", { exact: true })
        .count(),
      0,
      "a stale stream wrote into the selected conversation",
    );
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    assert.equal(
      await page.evaluate(() => window.fixtureStreams[1].closed),
      true,
      "pagehide did not close the live connection",
    );
    await page.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      ),
    );
    await page.waitForFunction(() => window.fixtureStreams.length === 3);
    await page.locator("#logout").click();
    await page.locator("#pair:visible").waitFor();
    assert.equal(
      await page.evaluate(() => window.fixtureStreams[2].closed),
      true,
      "logout did not close the live connection",
    );
    await f.clean();
  });

  test(`${engine}: native add and delete bodies show accurate colored file changes`, async (t) => {
    const unified =
      "diff --git a/unified.txt b/unified.txt\nnew file mode 100644\n--- /dev/null\n+++ b/unified.txt\n@@ -0,0 +1 @@\n+already unified\n";
    const f = await fixture(t, engine, {
      state: {
        historyItems: [
          {
            id: "native-patches",
            type: "fileChange",
            status: "completed",
            data: {
              changes: [
                {
                  path: "new.txt",
                  kind: { type: "add" },
                  diff: "REMOTE_REDESIGN_WRITE_OK\n",
                },
                {
                  path: "removed.txt",
                  kind: { type: "delete" },
                  diff: "first removed line\nsecond removed line",
                },
                { path: "unified.txt", kind: { type: "add" }, diff: unified },
                {
                  path: "plus-content.txt",
                  kind: { type: "add" },
                  diff: "+literal content\n",
                },
              ],
            },
          },
        ],
      },
    });
    const { page } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    const timeline = page.locator(
      '#history [data-id="native-patches"] .changed-file-button',
    );
    await timeline.nth(3).waitFor();
    assert.equal(
      await timeline.nth(0).locator(".additions").innerText(),
      "+1",
      "native raw add content must count as one added line",
    );
    assert.equal(
      await timeline.nth(1).locator(".deletions").innerText(),
      "−2",
      "native raw delete content must include the final line without a newline",
    );
    assert.equal(
      await timeline.nth(2).locator(".additions").innerText(),
      "+1",
      "unified diff additions were counted twice",
    );
    assert.equal(
      await timeline.nth(3).locator(".additions").innerText(),
      "+1",
      "a literal plus at the start of added content was lost",
    );
    await page.locator("#changesToggle").click();
    const file = (name) =>
      page
        .locator("#changesContent .diff-file")
        .filter({ has: page.locator("summary > span", { hasText: name }) });
    assert.deepEqual(
      await file("new.txt").locator(".diff-line.add").allTextContents(),
      ["+REMOTE_REDESIGN_WRITE_OK"],
    );
    assert.equal(
      await file("new.txt").locator("summary .additions").innerText(),
      "+1",
    );
    assert.deepEqual(
      await file("removed.txt").locator(".diff-line.delete").allTextContents(),
      ["-first removed line", "-second removed line"],
    );
    assert.equal(
      await file("removed.txt").locator("summary .deletions").innerText(),
      "−2",
    );
    const unifiedLines = await file("unified.txt")
      .locator(".diff-line")
      .allTextContents();
    assert(
      unifiedLines.includes("+already unified"),
      "unified addition prefix was changed",
    );
    assert(
      !unifiedLines.includes("++already unified"),
      "unified addition received a second prefix",
    );
    assert.equal(
      await file("unified.txt").locator("summary .additions").innerText(),
      "+1",
    );
    assert.deepEqual(
      await file("plus-content.txt")
        .locator(".diff-line.add")
        .allTextContents(),
      ["++literal content"],
      "literal leading plus in raw file content was not preserved",
    );
    await f.clean();
  });

  test(`${engine}: streamed incomplete Markdown markers do not block subsequent chunks`, async (t) => {
    const f = await fixture(t, engine, {
      streaming: true,
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        live: {
          status: "inProgress",
          turn_id: "markdown-turn",
          items: [],
          requests: [],
        },
      },
    });
    const { page } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(() => window.fixtureStreams.length === 1);
    for (const [marker, complete] of [
      ["1. ", "1. Ordered item"],
      ["- ", "- Unordered item"],
      ["## ", "## Completed heading"],
    ]) {
      await page.evaluate(
        (text) =>
          window.fixtureStreams[0].emit({
            items: [
              {
                id: "markdown-answer",
                type: "agentMessage",
                turn_id: "markdown-turn",
                text,
              },
            ],
            remove: [],
          }),
        "Streaming prefix\n\n" + marker,
      );
      await page
        .locator("#live .markdown")
        .filter({ hasText: "Streaming prefix" })
        .waitFor();
      await page.evaluate(
        (text) =>
          window.fixtureStreams[0].emit({
            items: [
              {
                id: "markdown-answer",
                type: "agentMessage",
                turn_id: "markdown-turn",
                text,
              },
            ],
            remove: [],
          }),
        complete + "\n\nNext chunk arrived.",
      );
      await page.getByText("Next chunk arrived.", { exact: true }).waitFor();
    }
    assert.equal(
      await page.locator("#live .markdown h2").innerText(),
      "Completed heading",
    );
    await f.clean();
  });

  test(`${engine}: command-created files open from relative, absolute and Chinese links and the file browser`, async (t) => {
    const f = await fixture(t, engine, {
      downloadServer: true,
      projectFiles: [
        {
          path: project + "/src/cart.ts",
          relative: "src/cart.ts",
          name: "cart.ts",
          directory: false,
        },
        {
          path: project + "/测试.txt",
          relative: "测试.txt",
          name: "测试.txt",
          directory: false,
        },
      ],
      fileContents: {
        "src/cart.ts": "export const total = 42;\nexport const second = 2;",
      },
      state: {
        historyItems: [
          {
            id: "file-links",
            type: "agentMessage",
            text: "[Relative file](src/cart.ts)\n\n[Absolute file](/work/shop/src/cart.ts)\n\n[中文文件](测试.txt)\n\n[Source line](src/cart.ts#L2)\n\n[Out of scope](../private.txt)",
          },
        ],
      },
    });
    const { page, seen, origin } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    for (const label of ["Relative file", "Absolute file", "中文文件"]) {
      await page.getByRole("link", { name: label, exact: true }).click();
      await page.locator("#filePreview:visible").waitFor();
      const chinese = label === "中文文件";
      await page
        .getByText(chinese ? "测试内容" : "export const total = 42;", {
          exact: true,
        })
        .waitFor();
      assert.equal(
        seen.previews.at(-1).thread,
        session.id,
        "file previews must stay scoped to the selected conversation",
      );
      assert(
        seen.previews
          .at(-1)
          .path.endsWith(chinese ? "测试.txt" : "src/cart.ts"),
      );
      assert.equal(
        page.url(),
        origin + "/",
        "a local file link navigated the browser away from the conversation",
      );
      const downloadURL = new URL(
        await page.locator("#filePreviewDownload").getAttribute("href"),
        page.url(),
      );
      assert.equal(downloadURL.origin, origin);
      assert.equal(
        downloadURL.hash,
        "",
        "download exposes a private file path in its target",
      );
      assert(
        !downloadURL.pathname.startsWith("/api/"),
        "download bypasses the encrypted transport",
      );
      await page.locator("#closeFilePreview").click();
    }
    await page.getByRole("link", { name: "Source line", exact: true }).click();
    await page
      .locator('#filePreviewContent .file-line.highlight[data-line="2"]')
      .filter({ hasText: "export const second = 2;" })
      .waitFor();
    assert.equal(
      seen.previews.at(-1).path,
      "src/cart.ts",
      "line anchors must not become part of the filesystem path",
    );
    await page.locator("#closeFilePreview").click();
    await page.getByRole("link", { name: "Out of scope", exact: true }).click();
    await page
      .locator("#notice")
      .filter({ hasText: "File is outside the shared project" })
      .waitFor();
    assert.equal(page.url(), origin + "/");
    await page.locator("#filesToggle").click();
    await page
      .locator("#filesContent button")
      .filter({ hasText: "测试.txt" })
      .click();
    await page
      .locator("#filePreviewContent")
      .filter({ hasText: "测试内容" })
      .waitFor();
    const download = page.waitForEvent("download");
    await page.locator("#filePreviewDownload").click();
    assert.equal((await download).suggestedFilename(), "测试.txt");
    await screenshot(page, `workspace-file-preview-${engine}-1440.png`);
    await f.clean();
  });

  test(`${engine}: workspace changes include command writes and replace duplicate native file patches`, async (t) => {
    const f = await fixture(t, engine, {
      state: {
        historyItems: [
          {
            id: "command-write",
            type: "commandExecution",
            status: "completed",
            data: {
              command: "printf '测试内容' > 测试.txt",
              cwd: project,
              aggregatedOutput: "",
              exitCode: 0,
            },
          },
          {
            id: "prior-cart",
            type: "fileChange",
            turn_id: "earlier-turn",
            status: "completed",
            data: {
              changes: [
                { path: "src/cart.ts", diff: patch("prior-original", "old") },
              ],
            },
          },
          {
            id: "native-cart",
            type: "fileChange",
            turn_id: "workspace-turn",
            status: "completed",
            data: {
              changes: [
                {
                  path: "src/cart.ts",
                  diff: patch("old", "native-intermediate"),
                },
              ],
            },
          },
        ],
        workspaceChanges: [
          {
            path: "测试.txt",
            kind: "add",
            diff: "diff --git a/测试.txt b/测试.txt\n--- /dev/null\n+++ b/测试.txt\n@@ -0,0 +1 @@\n+测试内容\n",
            turn_id: "workspace-turn",
            source: "workspace",
          },
          {
            path: "src/cart.ts",
            kind: "update",
            diff: patch("old", "workspace-final"),
            turn_id: "workspace-turn",
            source: "workspace",
          },
        ],
      },
    });
    const { page } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.locator("#changesToggle").click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll("#changesContent .diff-file").length === 3,
    );
    assert.equal(await page.locator("#changeCount").innerText(), "2");
    assert.match(await page.locator("#changesContent").innerText(), /测试内容/);
    assert.match(
      await page.locator("#changesContent").innerText(),
      /workspace-final/,
    );
    assert.match(
      await page.locator("#changesContent").innerText(),
      /prior-original/,
      "workspace aggregation discarded earlier-turn changes for the same path",
    );
    assert(
      !/native-intermediate/.test(
        await page.locator("#changesContent").innerText(),
      ),
      "native and workspace records for the same path were duplicated",
    );
    await screenshot(page, `workspace-command-changes-${engine}-1440.png`);
    await f.clean();
  });

  test(`${engine}: file browser and references use the selected nested working directory`, async (t) => {
    const nested = {
      ...session,
      id: "nested-session",
      cwd: project + "/packages/site",
    };
    const relative = "src/index.ts",
      absolute = nested.cwd + "/" + relative;
    const f = await fixture(t, engine, {
      rows: [nested],
      projectFiles: [
        { path: absolute, relative, name: "index.ts", directory: false },
      ],
      fileContents: { [relative]: "export const nested = true;\n" },
      state: {
        historyItems: [
          {
            id: "nested-link",
            type: "agentMessage",
            text: "[Nested source](src/index.ts)",
          },
        ],
      },
    });
    const { page, seen } = f;
    await page.locator('#sessions button[data-id="nested-session"]').click();
    await page.locator("#filesToggle").click();
    await page
      .locator("#filesContent button")
      .filter({ hasText: relative })
      .waitFor();
    assert.deepEqual(seen.files.at(-1), { project, thread: nested.id, q: "" });
    await page
      .locator("#filesContent button")
      .filter({ hasText: relative })
      .click();
    await page
      .locator("#filePreviewContent")
      .filter({ hasText: "export const nested = true;" })
      .waitFor();
    assert.deepEqual(seen.previews.at(-1), {
      thread: nested.id,
      path: absolute,
    });
    await page.locator("#closeChanges").click();
    await page.locator("#message").fill("@src");
    await page
      .locator("#suggestions button")
      .filter({ hasText: relative })
      .click();
    assert.deepEqual(seen.files.at(-1), {
      project,
      thread: nested.id,
      q: "src",
    });
    await page
      .getByRole("link", { name: "Nested source", exact: true })
      .click();
    await page
      .locator("#filePreviewContent")
      .filter({ hasText: "export const nested = true;" })
      .waitFor();
    assert.deepEqual(seen.previews.at(-1), {
      thread: nested.id,
      path: relative,
    });
    await f.clean();
  });

  test(`${engine}: completed plans require confirmation, survive reload and execute only once`, async (t) => {
    let release;
    const confirmed = new Promise((resolve) => {
      release = resolve;
    });
    t.after(() => release());
    const f = await fixture(t, engine, {
      state: {
        pendingPlan: {
          id: "plan-1",
          text: "# Update checkout\n\n1. Inspect cart tests.\n2. Implement checkout.",
          turn_id: "plan-turn",
        },
        live: {
          status: "completed",
          turn_id: "plan-turn",
          items: [],
          requests: [],
        },
        sessionOptions: { ...defaults, mode: "plan" },
      },
      beforeExecute: () => confirmed,
    });
    const { page, seen, state } = f;
    const executions = () =>
      seen.posts.filter((post) => post.path.endsWith("/execute-plan"));
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.locator("#planAction:visible").waitFor();
    assert.equal(
      executions().length,
      0,
      "a completed plan executed automatically",
    );
    await page
      .locator("#message")
      .fill("Please add one more verification step.");
    await page.locator("#continuePlanning").click();
    await page.locator("#revisePlanDialog[open]").waitFor();
    assert.equal(
      await page.locator("#message").inputValue(),
      "Please add one more verification step.",
    );
    assert.equal(executions().length, 0);
    await page.locator("#cancelRevisePlan").click();
    await page.locator("#executePlan").click();
    await page.locator("#executePlanDialog[open]").waitFor();
    assert.match(
      await page.locator("#executePlanPermissions").innerText(),
      /Ask for approval/,
      "execution confirmation must describe the native approval mode",
    );
    await screenshot(page, `workspace-plan-confirm-${engine}-1440.png`);
    assert.equal(
      executions().length,
      0,
      "opening the confirmation dialog executed the plan",
    );
    await page.locator("#cancelExecutePlan").click();
    assert(state.pendingPlan, "cancel discarded the pending plan");
    await page.reload();
    await page.locator("#workspace:visible").waitFor();
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.locator("#planAction:visible").waitFor();
    assert.equal(executions().length, 0, "reloading executed the pending plan");
    await page.locator("#executePlan").click();
    let executing;
    const executionStarted = new Promise((resolve) => (executing = resolve));
    await page.route(
      "**/api/threads/" + session.id + "/execute-plan",
      async (route) => {
        executing();
        return route.fallback();
      },
    );
    await page.locator("#confirmExecutePlan").click();
    await executionStarted;
    await page.waitForFunction(
      () => document.getElementById("confirmExecutePlan").disabled,
    );
    await page.locator("#confirmExecutePlan").dispatchEvent("click");
    assert.equal(
      executions().length,
      1,
      "duplicate confirmation sent the same plan twice",
    );
    assert.deepEqual(executions()[0].data, {
      plan_id: "plan-1",
      model: "codex-main",
      effort: "medium",
      permission: "workspace-write",
    });
    release();
    await page
      .getByText("Implementing the confirmed plan.", { exact: true })
      .waitFor();
    await page.locator("#planAction").waitFor({ state: "hidden" });
    assert.equal(state.pendingPlan, null);
    assert.match(await page.locator("#mode").innerText(), /Default mode/);
    assert(await page.locator("#stop").isVisible());
    await f.clean();
  });

  test(`${engine}: continue planning collects feedback, preserves the draft and revises only the current plan`, async (t) => {
    let release;
    const submitted = new Promise((resolve) => {
      release = resolve;
    });
    t.after(() => release());
    const originalPlan = {
      id: "plan-before-revision",
      text: "# Update checkout\n\n1. Inspect cart tests.\n2. Implement checkout.",
      turn_id: "plan-turn",
    };
    const f = await fixture(t, engine, {
      state: {
        pendingPlan: originalPlan,
        live: {
          status: "completed",
          turn_id: "plan-turn",
          items: [],
          requests: [],
        },
        sessionOptions: { ...defaults, mode: "plan", permission: "read-only" },
      },
      beforeTurn: () => submitted,
      onTurn(state) {
        state.pendingPlan = null;
        state.live = {
          status: "inProgress",
          turn_id: "revision-turn",
          items: [
            {
              id: "revising-plan",
              type: "agentMessage",
              text: "Revising the checkout plan.",
            },
          ],
          requests: [],
        };
      },
    });
    const { page, state, seen } = f;
    const revisions = () =>
      seen.posts.filter((post) => post.path.endsWith("/turn"));
    const executions = () =>
      seen.posts.filter((post) => post.path.endsWith("/execute-plan"));
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.locator("#planAction:visible").waitFor();
    await menu(page, "model", "Codex Fast");
    await menu(page, "effort", "High");
    assert.match(await page.locator("#permission").innerText(), /Read only/);
    const draft = "Unsent ordinary message with separate work.";
    await page.locator("#message").fill(draft);
    await page.locator("#continuePlanning").click();
    await page.locator("#revisePlanDialog[open]").waitFor();
    assert.equal(
      revisions().length,
      0,
      "opening revision immediately started a turn",
    );
    await page.locator("#planFeedback").fill("   ");
    await page.locator("#confirmRevisePlan").dispatchEvent("click");
    assert.equal(revisions().length, 0, "empty feedback started a revision");
    await page
      .locator("#planFeedback")
      .fill("Do not discard this ordinary composer draft.");
    await page.locator("#cancelRevisePlan").click();
    await page.locator("#revisePlanDialog").waitFor({ state: "hidden" });
    assert.equal(
      await page.locator("#message").inputValue(),
      draft,
      "cancelling revision discarded the ordinary composer draft",
    );
    assert.equal(revisions().length, 0, "cancelling revision submitted a turn");
    assert.equal(
      state.pendingPlan.id,
      originalPlan.id,
      "cancelling consumed the pending plan",
    );
    await page.locator("#continuePlanning").click();
    await page.locator("#revisePlanDialog[open]").waitFor();
    const feedback =
      "Add a rollback step and verify the total before changing checkout.";
    await page.locator("#planFeedback").fill(feedback);
    await screenshot(page, `workspace-plan-revision-${engine}-1440.png`);
    let revising;
    const revisionStarted = new Promise((resolve) => (revising = resolve));
    await page.route(
      "**/api/threads/" + session.id + "/turn",
      async (route) => {
        revising();
        return route.fallback();
      },
    );
    await page.locator("#confirmRevisePlan").click();
    await revisionStarted;
    await page.waitForFunction(
      () => document.getElementById("confirmRevisePlan").disabled,
    );
    await page.locator("#confirmRevisePlan").dispatchEvent("click");
    assert.equal(
      revisions().length,
      1,
      "duplicate confirmation started two revisions",
    );
    const revision = revisions()[0];
    assert.equal(
      revision.path,
      "/api/threads/" + session.id + "/turn",
      "revision started a different conversation",
    );
    assert.equal(revision.data.mode, "plan");
    assert.equal(revision.data.model, "codex-fast");
    assert.equal(revision.data.effort, "high");
    assert.equal(revision.data.permission, "read-only");
    assert(
      revision.data.text.includes(feedback),
      "revision omitted the supplementary feedback",
    );
    assert.equal(executions().length, 0, "revision executed the existing plan");
    release();
    await page
      .getByText("Revising the checkout plan.", { exact: true })
      .waitFor();
    await page.locator("#revisePlanDialog").waitFor({ state: "hidden" });
    assert.equal(
      await page.locator("#message").inputValue(),
      draft,
      "successful revision discarded the ordinary composer draft",
    );
    assert(
      await page.locator("#stop").isVisible(),
      "revision did not enter a running turn",
    );
    assert.match(await page.locator("#mode").innerText(), /Plan mode/);
    assert.equal(
      seen.posts.filter((post) => post.path === "/api/threads").length,
      0,
      "revision created an unrelated conversation",
    );
    state.pendingPlan = {
      id: "plan-after-revision",
      text: "# Safer checkout\n\n1. Verify the total.\n2. Add rollback.\n3. Update checkout.",
      turn_id: "revision-turn",
    };
    state.live = {
      status: "completed",
      turn_id: "revision-turn",
      items: [
        {
          id: "revised-plan",
          type: "plan",
          status: "completed",
          turn_id: "revision-turn",
          text: state.pendingPlan.text,
        },
      ],
      requests: [],
    };
    await page.locator("#refresh").click();
    await page.locator("#planAction:visible").waitFor();
    assert.equal(
      executions().length,
      0,
      "completed revision executed without another confirmation",
    );
    await page.locator("#executePlan").click();
    await page.locator("#executePlanDialog[open]").waitFor();
    assert.equal(
      executions().length,
      0,
      "opening revised-plan confirmation executed it",
    );
    await page.locator("#confirmExecutePlan").click();
    await page
      .getByText("Implementing the confirmed plan.", { exact: true })
      .waitFor();
    assert.equal(executions().length, 1);
    assert.equal(executions()[0].data.plan_id, "plan-after-revision");
    await f.clean();
  });

  test(`${engine}: failed plan revision keeps the feedback dialog ready for retry`, async (t) => {
    const f = await fixture(t, engine, {
      state: {
        pendingPlan: {
          id: "revise-retry-plan",
          text: "Inspect, then implement.",
          turn_id: "plan-turn",
        },
        turnError: "The revision could not be started. Please retry.",
        live: {
          status: "completed",
          turn_id: "plan-turn",
          items: [],
          requests: [],
        },
        sessionOptions: { ...defaults, mode: "plan" },
      },
    });
    const { page, seen, state } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.locator("#planAction:visible").waitFor();
    await page.locator("#message").fill("Keep this unrelated draft.");
    await page.locator("#continuePlanning").click();
    await page.locator("#revisePlanDialog[open]").waitFor();
    const feedback = "Please add an acceptance check.";
    await page.locator("#planFeedback").fill(feedback);
    await page.locator("#confirmRevisePlan").click();
    await page
      .locator("#notice")
      .filter({ hasText: "The revision could not be started. Please retry." })
      .waitFor();
    await page
      .locator("#planFeedbackError")
      .filter({ hasText: "The revision could not be started. Please retry." })
      .waitFor();
    assert(
      await page.locator("#revisePlanDialog").evaluate((dialog) => dialog.open),
      "failed revision dismissed its feedback dialog",
    );
    assert.equal(await page.locator("#planFeedback").inputValue(), feedback);
    assert(
      await page.locator("#confirmRevisePlan").isEnabled(),
      "failed revision left confirmation disabled",
    );
    assert.equal(
      await page.locator("#message").inputValue(),
      "Keep this unrelated draft.",
    );
    assert.equal(state.pendingPlan.id, "revise-retry-plan");
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/turn")).length,
      1,
    );
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/execute-plan")).length,
      0,
    );
    await page.locator("#cancelRevisePlan").click();
    await f.clean();
  });

  test(`${engine}: a running or replaced plan cannot be revised from a stale feedback dialog`, async (t) => {
    for (const change of ["running", "replaced"]) {
      const f = await fixture(t, engine, {
        streaming: true,
        catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
        state: {
          pendingPlan: {
            id: "original-plan",
            text: "Inspect, then implement.",
            turn_id: "original-turn",
          },
          live: {
            status: "completed",
            turn_id: "original-turn",
            items: [],
            requests: [],
          },
          sessionOptions: { ...defaults, mode: "plan" },
        },
      });
      const { page, state, seen } = f;
      await page.locator('#sessions button[data-id="remote-rich"]').click();
      await page.locator("#planAction:visible").waitFor();
      await page.waitForFunction(() => window.fixtureStreams.length === 1);
      await page.evaluate(() => window.fixtureStreams[0].open());
      await page.locator("#continuePlanning").click();
      await page.locator("#revisePlanDialog[open]").waitFor();
      await page
        .locator("#planFeedback")
        .fill("Keep the feedback visible while checking the current plan.");
      if (change === "running") {
        await page.evaluate(() =>
          window.fixtureStreams[0].emit({
            items: [],
            remove: [],
            state: {
              status: "inProgress",
              turn_id: "another-active-turn",
              requests: [],
            },
          }),
        );
      } else {
        state.pendingPlan = {
          id: "replacement-plan",
          text: "A new completed plan.",
          turn_id: "replacement-turn",
        };
        const refreshed = page.waitForResponse((response) =>
          new URL(response.url()).pathname.endsWith("/plan"),
        );
        await page.evaluate(() =>
          window.fixtureStreams[0].emit({
            items: [],
            remove: [],
            state: {
              status: "completed",
              turn_id: "replacement-turn",
              requests: [],
            },
          }),
        );
        await refreshed;
      }
      await page.locator("#confirmRevisePlan").click();
      await page
        .locator("#planFeedbackError")
        .filter({
          hasText:
            "The plan changed. Close this dialog and review the latest conversation.",
        })
        .waitFor();
      assert.equal(
        seen.posts.filter((post) => post.path.endsWith("/turn")).length,
        0,
        change + " plan started a revision from stale dialog",
      );
      assert.equal(
        seen.posts.filter((post) => post.path.endsWith("/execute-plan")).length,
        0,
      );
      assert(
        await page
          .locator("#revisePlanDialog")
          .evaluate((dialog) => dialog.open),
        "stale plan dismissed the feedback dialog",
      );
      assert.equal(
        await page.locator("#planFeedback").inputValue(),
        "Keep the feedback visible while checking the current plan.",
      );
      await page.locator("#cancelRevisePlan").click();
      await f.clean();
    }
  });

  test(`${engine}: failed plan execution retains the plan for retry`, async (t) => {
    const f = await fixture(t, engine, {
      state: {
        pendingPlan: {
          id: "retry-plan",
          text: "Inspect, then implement.",
          turn_id: "plan-turn",
        },
        executeError: "The plan changed. Refresh before executing.",
        live: {
          status: "completed",
          turn_id: "plan-turn",
          items: [],
          requests: [],
        },
      },
    });
    const { page, state, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.locator("#planAction:visible").waitFor();
    await page.locator("#executePlan").click();
    await page.locator("#confirmExecutePlan").click();
    await page
      .locator("#notice")
      .filter({ hasText: "The plan changed. Refresh before executing." })
      .waitFor();
    assert.equal(state.pendingPlan.id, "retry-plan");
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/execute-plan")).length,
      1,
    );
    assert(
      await page.locator("#confirmExecutePlan").isEnabled(),
      "failed execution left the confirmation locked",
    );
    await page.locator("#cancelExecutePlan").click();
    await page.locator("#planAction:visible").waitFor();
    await f.clean();
  });

  test(`${engine}: SSE workspace revisions refresh command changes without polling on every chunk`, async (t) => {
    const f = await fixture(t, engine, {
      streaming: true,
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        live: {
          status: "inProgress",
          turn_id: "command-turn",
          items: [],
          requests: [],
          workspace_revision: 0,
        },
      },
    });
    const { page, state, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(() => window.fixtureStreams.length === 1);
    await page.evaluate(() => window.fixtureStreams[0].open());
    state.workspaceChanges = [
      {
        path: "测试.txt",
        kind: "add",
        diff: "diff --git a/测试.txt b/测试.txt\n--- /dev/null\n+++ b/测试.txt\n@@ -0,0 +1 @@\n+stream-written\n",
        turn_id: "command-turn",
        source: "workspace",
      },
    ];
    const changed = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/changes"),
    );
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [],
        remove: [],
        state: { workspace_revision: 1 },
      }),
    );
    await changed;
    await page.locator("#changesToggle").click();
    await page
      .locator("#changesContent")
      .filter({ hasText: "stream-written" })
      .waitFor();
    const requests = seen.changes.length;
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [
          {
            id: "still-working",
            type: "agentMessage",
            text: "Checking the result…",
          },
        ],
        remove: [],
        state: { workspace_revision: 1 },
      }),
    );
    await page.getByText("Checking the result…", { exact: true }).waitFor();
    await page.clock.fastForward(500);
    assert.equal(
      seen.changes.length,
      requests,
      "an unchanged workspace revision refetched file changes",
    );
    await f.clean();
  });

  test(`${engine}: another pending request preserves the answer being composed`, async (t) => {
    const first = {
      id: "first-question",
      method: "item/tool/requestUserInput",
      params: {
        questions: [
          {
            id: "scope",
            question: "Which checkout?",
            options: [
              { label: "Cart", description: "Cart page" },
              { label: "Both", description: "Cart and payment" },
            ],
          },
          { id: "notes", question: "Special instructions?" },
        ],
      },
    };
    const second = {
      id: "second-question",
      method: "item/tool/requestUserInput",
      params: {
        questions: [
          {
            id: "format",
            question: "Which output format?",
            options: [{ label: "Markdown", description: "A readable summary" }],
          },
        ],
      },
    };
    const f = await fixture(t, engine, {
      state: {
        live: {
          status: "inProgress",
          turn_id: "pending-turn",
          items: [],
          requests: [first],
        },
      },
      onAnswer(state) {
        state.live.requests.shift();
        if (!state.live.requests.length) state.live.status = "completed";
      },
    });
    const { page, state, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.locator("#requestDialog[open]").waitFor();
    await page.locator('#requests input[name="scope"][value="Cart"]').check();
    await page.locator('#requests input[name="notes-text"]').fill("keep me");
    state.live.requests.push(second);
    state.live.items.push({
      id: "queue-updated",
      type: "agentMessage",
      text: "Another request is waiting.",
    });
    const refreshed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/sessions/remote-rich",
    );
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await refreshed;
    await page.locator('#live [data-id="queue-updated"]').waitFor();
    assert.equal(
      await page.locator('#requests input[name="notes-text"]').inputValue(),
      "keep me",
      "a queued request erased the free-text answer",
    );
    assert.equal(
      await page
        .locator('#requests input[name="scope"][value="Cart"]')
        .isChecked(),
      true,
      "a queued request erased the selected option",
    );
    await page
      .getByRole("button", { name: "Submit answer", exact: true })
      .click();
    await page.getByText("Which output format?", { exact: true }).waitFor();
    assert.deepEqual(
      seen.posts.filter((post) => post.path.endsWith("/answer"))[0].data,
      { id: "first-question", answers: { scope: "Cart", notes: "keep me" } },
    );
    await page
      .locator('#requests input[name="format"][value="Markdown"]')
      .check();
    await page
      .getByRole("button", { name: "Submit answer", exact: true })
      .click();
    await page.locator("#requestDialog").waitFor({ state: "hidden" });
    assert.deepEqual(
      seen.posts.filter((post) => post.path.endsWith("/answer"))[1].data,
      { id: "second-question", answers: { format: "Markdown" } },
    );
    await f.clean();
  });

  test(`${engine}: messages sent during a turn wait durably with attachments until explicit steer or removal`, async (t) => {
    const f = await fixture(t, engine, {
      state: {
        live: {
          status: "inProgress",
          turn_id: "busy-turn",
          items: [],
          requests: [],
        },
      },
    });
    const { page, seen, state } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page
      .locator("#fileInput")
      .setInputFiles({
        name: "queued-notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("queued file context"),
      });
    await page.locator("#attachments .attachment-chip").waitFor();
    await page
      .locator("#message")
      .fill("Wait until the current work has finished.");
    assert.equal(
      await page.locator("#send").getAttribute("aria-label"),
      "Queue message",
    );
    await page.locator("#send").click();
    const queued = page.locator('#queueList [data-queue-id="queue-1"]');
    await queued
      .locator(".queue-message-text")
      .filter({ hasText: "Wait until the current work has finished." })
      .waitFor();
    assert.match(
      await queued.locator(".queue-attachments").innerText(),
      /queued-notes\.txt/,
    );
    assert.equal(await page.locator("#message").inputValue(), "");
    assert.equal(
      await page.locator("#attachments .attachment-chip").count(),
      0,
    );
    assert.deepEqual(
      seen.deletes,
      [],
      "successful enqueue must transfer attachments instead of deleting them",
    );
    const { request_id: queuedRequestID, ...queuedInput } = seen.posts.find(
      (post) => post.path.endsWith("/queue"),
    ).data;
    assert.match(
      queuedRequestID,
      /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i,
    );
    assert.deepEqual(queuedInput, {
      text: "Wait until the current work has finished.",
      attachments: ["upload-1"],
      ...defaults,
    });
    assert.equal(
      seen.posts.filter(
        (post) => post.path.endsWith("/turn") || post.path.endsWith("/steer"),
      ).length,
      0,
      "queueing started or steered a turn automatically",
    );
    await screenshot(page, `workspace-queue-${engine}-1440.png`);
    await page.locator("#refresh").click();
    await queued.waitFor();
    assert.equal(
      await page.locator("#queueList [data-queue-id]").count(),
      1,
      "refresh duplicated the durable queued message",
    );
    state.steerError = "The active turn changed. Try again.";
    await queued.locator(".queue-steer").click();
    await page
      .locator("#notice")
      .filter({ hasText: state.steerError })
      .waitFor();
    assert.equal(
      state.queues[session.id].length,
      1,
      "failed steering removed the saved message",
    );
    assert(await queued.locator(".queue-steer").isEnabled());
    state.steerError = "";
    await queued.locator(".queue-steer").click();
    await page
      .locator("#live")
      .getByText("Wait until the current work has finished.", { exact: true })
      .waitFor();
    await page.locator("#queuePanel").waitFor({ state: "hidden" });
    await page.locator("#message").fill("First waiting follow-up.");
    await page.locator("#send").click();
    state.live = { ...state.live, status: "completed" };
    await page.locator("#refresh").click();
    await page.locator("#message").fill("Second waiting follow-up.");
    await page.locator("#send").click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll("#queueList [data-queue-id]").length === 2,
    );
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/turn")).length,
      0,
      "an idle conversation with waiting messages must keep order by enqueueing",
    );
    assert(
      await page.locator("#queueList .queue-steer").first().isDisabled(),
      "completed turns cannot accept steering",
    );
    for (let count = 2; count > 0; count--) {
      await page.locator("#queueList .queue-remove").first().click();
      await page.waitForFunction(
        (n) =>
          document.querySelectorAll("#queueList [data-queue-id]").length === n,
        count - 1,
      );
    }
    assert.equal(seen.queueDeletes.length, 2);
    const normalTurn = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/turn"),
    );
    await page.locator("#message").fill("Now start a normal task.");
    await page.locator("#send").click();
    await normalTurn;
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/turn")).length,
      1,
      "an idle conversation without a queue should use a normal turn",
    );
    await f.clean();
  });

  test(`${engine}: queued message edits are cancellable, retain the draft on failure and patch the original item`, async (t) => {
    const queued = {
      id: "edit-queue",
      text: "Original queued message.",
      status: "waiting",
      attachments: [{ id: "upload-1", name: "keep.txt" }],
      skills: [
        {
          name: "repo-style",
          path: "/work/shop/.agents/skills/repo-style/SKILL.md",
        },
      ],
      mentions: [{ path: "/work/shop/src/cart.ts", name: "cart.ts" }],
      tools: [{ server: "docs", name: "lookup" }],
      model: "codex-fast",
      effort: "high",
      mode: "plan",
      permission: "auto-review",
    };
    const owner = {
      kind: "background",
      state: "connected",
      epoch: "queue-edit-owner",
      capabilities: { send: true, queue: true, steer: true, configure: true },
    };
    const f = await fixture(t, engine, {
      streaming: true,
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        queues: { [session.id]: [queued] },
        queueEditError: "Queue storage is temporarily unavailable.",
        live: {
          status: "inProgress",
          turn_id: "edit-turn",
          owner,
          items: [],
          requests: [],
        },
      },
    });
    const { page, seen, state } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    const row = page.locator('#queueList [data-queue-id="edit-queue"]');
    await page.locator("#message").fill("Keep this separate composer draft.");
    await row.locator(".queue-edit").click();
    await page.locator("#queueEditText").fill("Discard this local edit.");
    await page.locator("#cancelQueueEdit").click();
    assert.equal(
      seen.queueEdits.length,
      0,
      "cancel must not mutate the saved queue entry",
    );
    assert.equal(state.queues[session.id][0].text, "Original queued message.");

    await row.locator(".queue-edit").click();
    await page
      .locator("#queueEditText")
      .fill("Keep this draft until the edit is confirmed.");
    await page.locator("#saveQueueEdit").click();
    await page
      .locator("#notice")
      .filter({ hasText: "Queue storage is temporarily unavailable." })
      .waitFor();
    await page
      .locator("#queueEditError")
      .filter({ hasText: "Queue storage is temporarily unavailable." })
      .waitFor();
    assert(
      await page.locator("#queueEditDialog").evaluate((dialog) => dialog.open),
      "failed edits should keep the editor open",
    );
    assert.equal(
      await page.locator("#queueEditText").inputValue(),
      "Keep this draft until the edit is confirmed.",
    );
    assert.equal(
      state.queues[session.id][0].text,
      "Original queued message.",
      "a failed edit changed the saved queue item",
    );

    state.queueEditError = "";
    await page.locator("#saveQueueEdit").click();
    await page.locator("#queueEditDialog").waitFor({ state: "hidden" });
    await row
      .locator(".queue-message-text")
      .filter({ hasText: "Keep this draft until the edit is confirmed." })
      .waitFor();
    assert.equal(seen.queueEdits.length, 2);
    assert.equal(
      seen.queueEdits[0].ownerEpoch,
      owner.epoch,
      "PATCH must carry the current owner epoch",
    );
    assert.deepEqual(seen.queueEdits[1].data, {
      text: "Keep this draft until the edit is confirmed.",
      attachments: ["upload-1"],
      skills: queued.skills,
      mentions: queued.mentions,
      tools: queued.tools,
      model: queued.model,
      effort: queued.effort,
      mode: queued.mode,
      permission: queued.permission,
    });
    assert.equal(
      state.queues[session.id][0].attachments[0].name,
      "keep.txt",
      "editing text discarded the queued attachment",
    );
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/queue")).length,
      0,
      "editing must not enqueue a replacement message",
    );
    assert.deepEqual(
      seen.queueDeletes,
      [],
      "editing must not delete and recreate the original message",
    );
    assert.equal(
      await page.locator("#message").inputValue(),
      "Keep this separate composer draft.",
      "queue editing overwrote the composer draft",
    );
    await f.clean();
  });

  test(`${engine}: a late queue edit response cannot replace another conversation or its editor draft`, async (t) => {
    let release, started;
    const held = new Promise((resolve) => {
        release = resolve;
      }),
      pending = new Promise((resolve) => {
        started = resolve;
      });
    const second = {
      ...session,
      id: "other-edit-thread",
      title: "Other edit conversation",
    };
    const firstMessage = {
        id: "first-edit",
        text: "First saved message.",
        status: "waiting",
      },
      secondMessage = {
        id: "second-edit",
        text: "Second saved message.",
        status: "waiting",
      };
    const f = await fixture(t, engine, {
      rows: [session, second],
      state: {
        queues: { [session.id]: [firstMessage], [second.id]: [secondMessage] },
        live: {
          status: "inProgress",
          turn_id: "late-edit-turn",
          items: [],
          requests: [],
        },
      },
      beforeQueueEdit: async () => {
        started();
        await held;
      },
    });
    const { page, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.locator("#queueList .queue-edit").click();
    await page
      .locator("#queueEditText")
      .fill("An edit for the earlier conversation.");
    await page.locator("#saveQueueEdit").click();
    await pending;
    const cancelled = page.waitForEvent(
      "requestfailed",
      (request) => request.method() === "PATCH",
    );
    await page
      .locator('#sessions button[data-id="other-edit-thread"]')
      .dispatchEvent("click");
    await page.locator('#queueList [data-queue-id="second-edit"]').waitFor();
    await page.locator("#queueList .queue-edit").click();
    await page.locator("#queueEditText").fill("Keep this newer editor draft.");
    release();
    await cancelled;
    assert.equal(await page.locator("#title").innerText(), second.title);
    assert(
      await page.locator("#queueEditDialog").evaluate((dialog) => dialog.open),
    );
    assert.equal(
      await page.locator("#queueEditText").inputValue(),
      "Keep this newer editor draft.",
    );
    assert.equal(
      await page.locator('#queueList [data-queue-id="first-edit"]').count(),
      0,
      "a late edit response replaced the newer queue",
    );
    assert.deepEqual(seen.queueDeletes, []);
    await f.clean();
  });

  test(`${engine}: a new native owner accepts its queue revision and text edits preserve opaque attachments`, async (t) => {
    const owner = {
      kind: "native",
      state: "connected",
      epoch: "old-queue-owner",
      capabilities: { send: true, queue: true, steer: true, configure: true },
    };
    const oldMessage = {
      id: "old-native-queue",
      text: "Old owner message.",
      status: "waiting",
    };
    const nativeMessage = {
      id: "native-queue",
      text: "Native queued message.",
      status: "waiting",
      attachments: [{ id: "", name: "Native attachment.pdf" }],
      context: { native: true, hidden: "preserve" },
    };
    const f = await fixture(t, engine, {
      streaming: true,
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        queues: { [session.id]: [oldMessage] },
        queueRevisions: { [session.id]: 20 },
        live: {
          status: "inProgress",
          turn_id: "native-queue-turn",
          owner,
          items: [],
          requests: [],
        },
      },
    });
    const { page, state, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page
      .locator('#queueList [data-queue-id="old-native-queue"]')
      .waitFor();
    let release,
      started,
      first = true;
    const held = new Promise((resolve) => {
        release = resolve;
      }),
      pending = new Promise((resolve) => {
        started = resolve;
      });
    t.after(() => release());
    await page.route(
      "**/api/threads/" + session.id + "/queue",
      async (route) => {
        if (route.request().method() !== "GET" || !first)
          return route.fallback();
        first = false;
        started();
        await held;
        try {
          await route.fulfill({ json: { queue: [oldMessage], revision: 99 } });
        } catch (error) {
          if (!/handled|closed|canceled|cancelled/i.test(error.message))
            throw error;
        }
      },
    );
    await page.locator("#refresh").click();
    await pending;
    const cancelled = page.waitForEvent(
      "requestfailed",
      (request) =>
        request.method() === "GET" &&
        new URL(request.url()).pathname.endsWith("/queue"),
    );
    state.queues[session.id] = [nativeMessage];
    state.queueRevisions[session.id] = 1;
    state.live = {
      ...state.live,
      owner: { ...owner, epoch: "new-queue-owner" },
    };
    await page.evaluate(
      ({ owner, entry }) =>
        window.fixtureStreams[0].emit({
          items: [],
          remove: [],
          state: {
            owner,
            queue: [entry],
            queue_revision: 1,
            queue_paused: false,
          },
        }),
      { owner: state.live.owner, entry: nativeMessage },
    );
    await page.locator('#queueList [data-queue-id="native-queue"]').waitFor();
    release();
    await cancelled;
    assert.equal(
      await page
        .locator('#queueList [data-queue-id="old-native-queue"]')
        .count(),
      0,
      "an old owner response restored its queue",
    );
    await page.locator("#queueList .queue-edit").click();
    await page.locator("#queueEditText").fill("Updated native queue text.");
    await page.locator("#saveQueueEdit").click();
    await page.locator("#queueEditDialog").waitFor({ state: "hidden" });
    assert.deepEqual(
      seen.queueEdits.at(-1).data,
      { text: "Updated native queue text." },
      "native text edit sent incomplete attachment metadata",
    );
    assert.equal(seen.queueEdits.at(-1).ownerEpoch, "new-queue-owner");
    assert.deepEqual(
      state.queues[session.id][0].attachments,
      nativeMessage.attachments,
    );
    assert.deepEqual(
      state.queues[session.id][0].context,
      nativeMessage.context,
    );
    await page
      .locator("#queueList .queue-attachments")
      .filter({ hasText: "Native attachment.pdf" })
      .waitFor();
    await f.clean();
  });

  test(`${engine}: App-native queued messages remain text-editable after background owner takeover`, async (t) => {
    const owner = {
      kind: "native",
      state: "connected",
      epoch: "app-queue-owner",
      capabilities: { send: true, queue: true, steer: true, configure: true },
    };
    const nativeMessage = {
      id: "app-native-queue",
      native: true,
      text: "App follow-up.",
      status: "waiting",
      attachments: [{ id: "", name: "App context.pdf" }],
      context: { opaque: { path: "/private/app-context", selection: "keep" } },
      submissionOptions: {
        clientUserMessageId: "stable-app-message",
        serviceTier: "fast",
      },
      model: "codex-fast",
    };
    const f = await fixture(t, engine, {
      streaming: true,
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        queues: { [session.id]: [nativeMessage] },
        live: {
          status: "inProgress",
          turn_id: "takeover-turn",
          owner,
          items: [],
          requests: [],
        },
      },
    });
    const { page, state, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page
      .locator('#queueList [data-queue-id="app-native-queue"]')
      .waitFor();
    state.live = {
      ...state.live,
      owner: { ...owner, kind: "background", epoch: "background-queue-owner" },
    };
    await page.evaluate(
      ({ owner, entry }) =>
        window.fixtureStreams[0].emit({
          items: [],
          remove: [],
          state: { owner, queue: [entry], queue_revision: 0 },
        }),
      { owner: state.live.owner, entry: nativeMessage },
    );
    await page.locator("#queueList .queue-edit").click();
    await page
      .locator("#queueEditText")
      .fill("Edited after background takeover.");
    await page.locator("#saveQueueEdit").click();
    await page.locator("#queueEditDialog").waitFor({ state: "hidden" });
    assert.deepEqual(
      seen.queueEdits.at(-1),
      {
        thread: session.id,
        id: nativeMessage.id,
        data: { text: "Edited after background takeover." },
        ownerEpoch: "background-queue-owner",
      },
      "background takeover rebuilt opaque App attachment metadata",
    );
    assert.deepEqual(
      state.queues[session.id],
      [{ ...nativeMessage, text: "Edited after background takeover." }],
      "native text edit discarded App context, settings or stable identifiers",
    );
    await page
      .locator("#queueList .queue-attachments")
      .filter({ hasText: "App context.pdf" })
      .waitFor();
    assert.deepEqual(seen.queueDeletes, []);
    await f.clean();
  });

  test(`${engine}: queued steer binds the visible turn and preserves messages when the turn changed`, async (t) => {
    const owner = {
      kind: "background",
      state: "connected",
      epoch: "steer-queue-owner",
      capabilities: { send: true, queue: true, steer: true },
    };
    const entry = {
      id: "stale-turn-queue",
      text: "Only steer after reviewing the active turn.",
      status: "waiting",
    };
    const f = await fixture(t, engine, {
      streaming: true,
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        queues: { [session.id]: [entry] },
        live: {
          status: "inProgress",
          turn_id: "visible-turn",
          owner,
          items: [],
          requests: [],
        },
      },
    });
    const { page, state, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page
      .locator('#queueList [data-queue-id="stale-turn-queue"]')
      .waitFor();
    state.live = { ...state.live, turn_id: "replacement-turn" };
    await page.locator("#queueList .queue-steer").click();
    await page
      .locator("#notice")
      .filter({ hasText: "The active turn changed. Try again." })
      .waitFor();
    const attempts = () =>
      seen.posts.filter((post) =>
        post.path.endsWith("/queue/stale-turn-queue/steer"),
      );
    assert.deepEqual(
      attempts()[0].data,
      { expected_turn_id: "visible-turn" },
      "steering omitted the turn the user reviewed",
    );
    assert.deepEqual(
      state.queues[session.id],
      [entry],
      "a stale steer removed the saved message",
    );
    assert.equal(
      state.live.items.length,
      0,
      "a stale steer reached the replacement turn",
    );
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [],
        remove: [],
        state: { turn_id: "replacement-turn" },
      }),
    );
    assert.equal(
      attempts().length,
      1,
      "a rejected steer automatically retried against the new turn",
    );
    await page.locator("#queueList .queue-steer").click();
    await page.locator("#queuePanel").waitFor({ state: "hidden" });
    assert.deepEqual(attempts()[1].data, {
      expected_turn_id: "replacement-turn",
    });
    assert.equal(state.live.items[0].turn_id, "replacement-turn");
    await f.clean();
  });

  test(`${engine}: dismissing a pending question permits queueing and explicit steer without losing its drafted answer`, async (t) => {
    const question = {
      id: "pending-question",
      method: "item/tool/requestUserInput",
      params: {
        questions: [
          {
            id: "scope",
            question: "Which checkout?",
            options: [
              { label: "Cart", description: "Cart page" },
              { label: "Both", description: "Cart and payment" },
            ],
          },
          { id: "notes", question: "Special instructions?" },
        ],
      },
    };
    const f = await fixture(t, engine, {
      state: {
        live: {
          status: "inProgress",
          turn_id: "pending-turn",
          items: [],
          requests: [question],
        },
      },
    });
    const { page, seen, state } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.locator("#requestDialog[open]").waitFor();
    await page.locator('#requests input[name="scope"][value="Cart"]').check();
    await page
      .locator('#requests input[name="notes-text"]')
      .fill("Keep my draft answer.");
    await page.locator("#dismissRequest").click();
    await page
      .locator("#message")
      .fill("Wait for my answer before the next task.");
    assert(
      await page.locator("#send").isEnabled(),
      "a dismissed question must allow queueing a follow-up",
    );
    await page.locator("#send").click();
    await page
      .locator("#queueList .queue-message-text")
      .filter({ hasText: "Wait for my answer before the next task." })
      .waitFor();
    await page.locator("#queueRequestHint:visible").waitFor();
    assert.equal(
      seen.posts.filter(
        (post) => post.path.endsWith("/answer") || post.path.endsWith("/steer"),
      ).length,
      0,
      "enqueueing answered or steered the pending question",
    );
    await page.locator("#queueList .queue-steer").click();
    await page
      .locator("#live")
      .getByText("Wait for my answer before the next task.", { exact: true })
      .waitFor();
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/answer")).length,
      0,
      "explicit steer must not answer a native question",
    );
    assert.equal(state.live.requests.length, 1);
    await page.locator("#pendingRequest").click();
    assert.equal(
      await page.locator('#requests input[name="notes-text"]').inputValue(),
      "Keep my draft answer.",
    );
    assert(
      await page
        .locator('#requests input[name="scope"][value="Cart"]')
        .isChecked(),
    );
    await page.locator("#dismissRequest").click();
    await page.locator("#message").fill("Keep this unsent composer draft.");
    await page.locator("#pendingRequest").click();
    await page.locator("#dismissRequest").click();
    assert.equal(
      await page.locator("#message").inputValue(),
      "Keep this unsent composer draft.",
      "opening and cancelling a question discarded the composer draft",
    );
    state.live.status = "completed";
    await page.locator("#refresh").click();
    await page.locator("#send").click();
    await page
      .locator("#queueList .queue-message-text")
      .filter({ hasText: "Keep this unsent composer draft." })
      .waitFor();
    assert.equal(
      seen.posts.filter(
        (post) => post.path.endsWith("/turn") || post.path.endsWith("/answer"),
      ).length,
      0,
      "a pending native question must queue new messages even if the turn is no longer marked running",
    );
    await f.clean();
  });

  test(`${engine}: failed enqueue retains text and attachments for retry and a duplicate submit is ignored`, async (t) => {
    let release;
    const accepted = new Promise((resolve) => {
      release = resolve;
    });
    t.after(() => release());
    const f = await fixture(t, engine, {
      state: {
        enqueueError: "Queue storage is temporarily unavailable.",
        live: {
          status: "inProgress",
          turn_id: "busy-turn",
          items: [],
          requests: [],
        },
      },
      beforeEnqueue: () => accepted,
    });
    const { page, seen, state } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page
      .locator("#fileInput")
      .setInputFiles({
        name: "retry.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("retry context"),
      });
    await page.locator("#attachments .attachment-chip").waitFor();
    await page
      .locator("#message")
      .fill("Keep this task until saving succeeds.");
    await page.locator("#send").click();
    await page
      .locator("#notice")
      .filter({ hasText: state.enqueueError })
      .waitFor();
    assert.equal(
      await page.locator("#message").inputValue(),
      "Keep this task until saving succeeds.",
    );
    assert.equal(
      await page.locator("#attachments .attachment-chip").count(),
      1,
    );
    assert.deepEqual(seen.deletes, []);
    assert(await page.locator("#send").isEnabled());
    state.enqueueError = "";
    let enqueueing;
    const enqueueStarted = new Promise((resolve) => (enqueueing = resolve));
    await page.route(
      "**/api/threads/" + session.id + "/queue",
      async (route) => {
        enqueueing();
        return route.fallback();
      },
    );
    await page.locator("#send").click();
    await enqueueStarted;
    await page.waitForFunction(() => document.getElementById("send").disabled);
    await page.locator("#composer").dispatchEvent("submit");
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/queue")).length,
      2,
      "duplicate submit repeated a queued task while the first request was pending",
    );
    const attempts = seen.posts.filter((post) => post.path.endsWith("/queue"));
    assert.match(
      attempts[0].data.request_id,
      /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i,
    );
    assert.equal(
      attempts[1].data.request_id,
      attempts[0].data.request_id,
      "retrying the unchanged draft must reuse its enqueue ID",
    );
    release();
    await page
      .locator("#queueList .queue-message-text")
      .filter({ hasText: "Keep this task until saving succeeds." })
      .waitFor();
    assert.equal(state.queues[session.id].length, 1);
    assert.equal(await page.locator("#message").inputValue(), "");
    assert.equal(
      await page.locator("#attachments .attachment-chip").count(),
      0,
    );
    state.enqueueError = "Queue storage is temporarily unavailable.";
    await page.locator("#message").fill("A new follow-up draft.");
    await page.locator("#send").click();
    await page
      .locator("#notice")
      .filter({ hasText: state.enqueueError })
      .waitFor();
    const unchangedID = seen.posts
      .filter((post) => post.path.endsWith("/queue"))
      .at(-1).data.request_id;
    await page.locator("#message").fill("A changed follow-up draft.");
    await page.locator("#send").click();
    await page
      .locator("#notice")
      .filter({ hasText: state.enqueueError })
      .waitFor();
    assert.notEqual(
      seen.posts.filter((post) => post.path.endsWith("/queue")).at(-1).data
        .request_id,
      unchangedID,
      "a changed draft reused the idempotency key of different message contents",
    );
    await f.clean();
  });

  test(`${engine}: queue SSE updates, paused retries and conversation switching keep waiting messages isolated`, async (t) => {
    const second = {
      ...session,
      id: "queued-second",
      title: "Second queued conversation",
    };
    const one = {
      id: "saved-one",
      text: "Saved first conversation task.",
      attachments: [
        { id: "existing-file", name: "saved-context.txt", image: false },
      ],
      status: "waiting",
    };
    const two = {
      id: "saved-two",
      text: "Saved second conversation task.",
      status: "waiting",
    };
    const f = await fixture(t, engine, {
      streaming: true,
      rows: [session, second],
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        queues: { [session.id]: [one], [second.id]: [two] },
        live: {
          status: "inProgress",
          turn_id: "queue-stream-turn",
          items: [],
          requests: [],
        },
      },
    });
    const { page, seen, state } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(() => window.fixtureStreams.length === 1);
    await page
      .locator("#queueList .queue-message-text")
      .filter({ hasText: one.text })
      .waitFor();
    const streamed = {
      id: "streamed-waiting",
      text: "Waiting from another browser.",
      status: "failed",
      error: "Retry the queue explicitly.",
    };
    state.queues[session.id] = [one, streamed];
    state.queuePaused[session.id] = true;
    state.queueErrors[session.id] = "Retry the queue explicitly.";
    await page.evaluate(
      (queue) =>
        window.fixtureStreams[0].emit({
          items: [],
          remove: [],
          state: {
            queue,
            queue_revision: 1,
            queue_paused: true,
            queue_error: "Retry the queue explicitly.",
          },
        }),
      [one, streamed],
    );
    await page
      .locator("#queueList .queue-message-text")
      .filter({ hasText: streamed.text })
      .waitFor();
    await page.locator("#resumeQueue:visible").waitFor();
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/resume")).length,
      0,
      "a paused queue resumed automatically",
    );
    await page.locator("#resumeQueue").click();
    await page.locator("#resumeQueue").waitFor({ state: "hidden" });
    assert.deepEqual(
      seen.posts.find((post) => post.path.endsWith("/queue/resume")).data,
      {},
    );
    const ambiguous = [
      {
        id: "uncertain-message",
        text: "Review possible delivery.",
        status: "uncertain",
      },
      {
        id: "dispatching-message",
        text: "Sending saved task.",
        status: "dispatching",
      },
    ];
    await page.evaluate(
      (queue) =>
        window.fixtureStreams[0].emit({
          items: [],
          remove: [],
          state: { queue, queue_revision: 2, queue_paused: true },
        }),
      ambiguous,
    );
    await page
      .locator('#queueList [data-queue-id="uncertain-message"]')
      .waitFor();
    assert(
      await page.locator("#resumeQueue").isDisabled(),
      "uncertain delivery must not be automatically retried",
    );
    assert(
      await page
        .locator('#queueList [data-queue-id="uncertain-message"] .queue-steer')
        .isDisabled(),
    );
    assert(
      await page
        .locator(
          '#queueList [data-queue-id="dispatching-message"] .queue-remove',
        )
        .isDisabled(),
      "removing a dispatching task could conceal delivery",
    );
    await page.evaluate(
      (queue) =>
        window.fixtureStreams[0].emit({
          items: [],
          remove: [],
          state: { queue, queue_revision: 1, queue_paused: false },
        }),
      [one],
    );
    assert.equal(
      await page
        .locator('#queueList [data-queue-id="uncertain-message"]')
        .count(),
      1,
      "an older queue revision replaced newer delivery state",
    );
    await page.locator('#sessions button[data-id="queued-second"]').click();
    await page.waitForFunction(() => window.fixtureStreams.length === 2);
    await page
      .locator("#queueList .queue-message-text")
      .filter({ hasText: two.text })
      .waitFor();
    assert.equal(
      await page
        .locator("#queueList")
        .getByText(one.text, { exact: true })
        .count(),
      0,
    );
    await page.evaluate(
      (queue) =>
        window.fixtureStreams[0].emit({
          items: [],
          remove: [],
          state: { queue, queue_revision: 2 },
        }),
      [one],
    );
    assert.equal(
      await page
        .locator("#queueList")
        .getByText(one.text, { exact: true })
        .count(),
      0,
      "stale SSE from the previous conversation replaced the selected queue",
    );
    await page.reload();
    await page.locator("#workspace:visible").waitFor();
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll("#queueList [data-queue-id]").length === 2,
    );
    assert.match(
      await page.locator("#queueList").innerText(),
      /saved-context\.txt/,
    );
    assert.equal(
      seen.posts.filter(
        (post) => post.path.endsWith("/turn") || post.path.endsWith("/steer"),
      ).length,
      0,
    );
    await screenshot(page, `workspace-queue-saved-${engine}-1440.png`);
    await f.clean();
  });

  test(`${engine}: a lost enqueue response retries the same receipt after the queue has already completed`, async (t) => {
    const f = await fixture(t, engine, {
      streaming: true,
      abortEnqueueAfterAcceptOnce: true,
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        live: {
          status: "inProgress",
          turn_id: "busy-turn",
          items: [],
          requests: [],
        },
      },
    });
    const { page, seen, state } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(() => window.fixtureStreams.length === 1);
    await page.locator("#message").fill("Deliver this task exactly once.");
    await page.locator("#send").click();
    await page.waitForFunction(
      () =>
        !document.getElementById("send").disabled &&
        document.getElementById("notice").textContent.length > 0,
    );
    assert.equal(
      state.queues[session.id].length,
      1,
      "fixture must accept the first message before losing its response",
    );
    assert.equal(
      await page.locator("#message").inputValue(),
      "Deliver this task exactly once.",
    );
    const first = seen.posts.find((post) => post.path.endsWith("/queue"));
    state.queues[session.id] = [];
    state.queueRevisions[session.id] = 2;
    state.live = {
      status: "completed",
      turn_id: "delivered-turn",
      items: [],
      requests: [],
    };
    await page.evaluate(() =>
      window.fixtureStreams[0].emit({
        items: [],
        remove: [],
        state: {
          status: "completed",
          turn_id: "delivered-turn",
          requests: [],
          queue: [],
          queue_revision: 2,
          queue_paused: false,
        },
      }),
    );
    await page.locator("#stop").waitFor({ state: "hidden" });
    await page.locator("#send").click();
    await page.waitForFunction(
      () =>
        !document.getElementById("send").disabled ||
        document.getElementById("message").value === "",
    );
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/turn")).length,
      0,
      "retrying an accepted-but-unacknowledged enqueue started a duplicate normal turn after the original queue completed",
    );
    const attempts = seen.posts.filter((post) => post.path.endsWith("/queue"));
    assert.equal(attempts.length, 2);
    assert.equal(
      attempts[1].data.request_id,
      first.data.request_id,
      "retry must recover the existing queue receipt",
    );
    assert.equal(
      state.queues[session.id].length,
      0,
      "a known accepted receipt reinserted a delivered task",
    );
    assert.equal(await page.locator("#message").inputValue(), "");
    await f.clean();
  });

  test(`${engine}: a stale successful enqueue response cannot clear the draft after signing in again`, async (t) => {
    let release, enqueueing;
    const enqueueStarted = new Promise((resolve) => (enqueueing = resolve));
    const delayed = new Promise((resolve) => {
      release = resolve;
    });
    t.after(() => release());
    const f = await fixture(t, engine, {
      beforeEnqueue: () => {
        enqueueing();
        return delayed;
      },
      state: {
        live: {
          status: "inProgress",
          turn_id: "old-auth-turn",
          items: [],
          requests: [],
        },
      },
    });
    const { page, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page
      .locator("#message")
      .fill("An earlier authorization submitted this task.");
    await page.locator("#send").click();
    await enqueueStarted;
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/queue")).length,
      1,
    );
    await page.locator("#logout").dispatchEvent("click");
    await page.locator("#pair:visible").waitFor();
    await page.locator("#pairKey").fill(pairCode);
    await page.locator("#pairForm button").click();
    await page.locator("#workspace:visible").waitFor();
    await page.evaluate(() => {
      const input = document.getElementById("message");
      input.value = "Keep the new authorization draft.";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const completed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/queue") &&
        response.request().method() === "POST",
    );
    release();
    await completed;
    await page.waitForFunction(
      () => !document.getElementById("message").disabled,
    );
    assert.equal(
      await page.locator("#message").inputValue(),
      "Keep the new authorization draft.",
      "an enqueue response from the previous authorization cleared the new draft",
    );
    assert.equal(
      await page.locator("#queueList [data-queue-id]").count(),
      0,
      "a previous authorization applied its queued message to the new screen",
    );
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/turn")).length,
      0,
    );
    await f.clean();
  });

  test(`${engine}: archive-state recovery preserves an accepted enqueue receipt across response invalidation`, async (t) => {
    let release, accepted;
    const held = new Promise((resolve) => (release = resolve)),
      saved = new Promise((resolve) => (accepted = resolve));
    t.after(() => release());
    const owner = {
      kind: "native",
      state: "connected",
      epoch: "receipt-owner",
      capabilities: { send: true, queue: true, configure: true },
    };
    const f = await fixture(t, engine, {
      streaming: true,
      rows: [{ ...session, source: "codex-app" }],
      catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
      state: {
        live: {
          status: "inProgress",
          turn_id: "receipt-turn",
          owner,
          items: [],
          requests: [],
        },
      },
      afterEnqueue: async (_state, _data, seen) => {
        if (
          seen.posts.filter((post) => post.path.endsWith("/queue")).length === 1
        ) {
          accepted();
          await held;
        }
      },
    });
    const { page, seen, state } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page.waitForFunction(() => window.fixtureStreams.length === 1);
    await page
      .locator("#message")
      .fill("Deliver once despite an archive-index outage.");
    await page
      .locator("#fileInput")
      .setInputFiles({
        name: "receipt.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("saved attachment"),
      });
    await page.locator("#attachments .attachment-chip").waitFor();
    await page.locator("#send").click();
    await saved;
    assert.equal(state.queues[session.id].length, 1);
    await page.evaluate(() =>
      window.fixtureStreams[0].emitEvent("unavailable", {
        error:
          "Cannot read the Codex conversation archive state. Refresh after the local index is available.",
      }),
    );
    assert.equal(
      await page.locator("#message").inputValue(),
      "Deliver once despite an archive-index outage.",
    );
    assert.equal(
      await page.locator("#attachments .attachment-chip").count(),
      1,
    );
    assert(await page.locator("#send").isDisabled());
    await page.locator("#refresh").click();
    await page.waitForFunction(
      () =>
        !document.getElementById("send").disabled &&
        !document.getElementById("refresh").disabled,
    );
    assert.equal(
      await page.locator("#message").inputValue(),
      "Deliver once despite an archive-index outage.",
    );
    await page.locator("#send").click();
    await page.waitForFunction(
      () => document.getElementById("message").value === "",
    );
    const attempts = seen.posts.filter((post) => post.path.endsWith("/queue"));
    assert.equal(attempts.length, 2);
    assert.equal(
      attempts[1].data.request_id,
      attempts[0].data.request_id,
      "read-only invalidation changed the accepted draft receipt",
    );
    assert.equal(
      state.queues[session.id].length,
      1,
      "retry duplicated the accepted queued task",
    );
    assert.deepEqual(seen.deletes, []);
    await page
      .locator("#message")
      .fill("Keep the next draft after the old reply arrives.");
    const replied = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/queue") &&
        response.request().method() === "POST",
    );
    release();
    await replied;
    assert.equal(
      await page.locator("#message").inputValue(),
      "Keep the next draft after the old reply arrives.",
    );
    assert.equal(
      seen.posts.filter((post) => post.path.endsWith("/turn")).length,
      0,
    );
    await f.clean();
  });

  for (const reply of ["archived", "unavailable"])
    test(`${engine}: stale ${reply} HTTP replies cannot replace the refreshed conversation owner`, async (t) => {
      const owner = {
        kind: "native",
        state: "connected",
        epoch: "refreshed-owner",
        capabilities: { send: true, configure: true },
      };
      const f = await fixture(t, engine, {
        streaming: true,
        rows: [{ ...session, source: "codex-app" }],
        catalog: { capabilities: { ...catalog.capabilities, streaming: true } },
        state: { live: { status: "idle", owner, items: [], requests: [] } },
      });
      const { page } = f;
      await page.locator('#sessions button[data-id="remote-rich"]').click();
      await page.waitForFunction(() => window.fixtureStreams.length === 1);
      await page
        .locator("#message")
        .fill("Keep the refreshed conversation draft.");
      let release,
        started,
        first = true;
      const held = new Promise((resolve) => (release = resolve)),
        pending = new Promise((resolve) => (started = resolve));
      t.after(() => release());
      await page.route("**/api/sessions/" + session.id, async (route) => {
        if (!first) return route.fallback();
        first = false;
        started();
        await held;
        return route.fulfill({
          status: reply === "archived" ? 410 : 400,
          json:
            reply === "archived"
              ? {
                  error: "This conversation is archived in Codex.",
                  archived: true,
                }
              : {
                  error:
                    "Cannot read the Codex conversation archive state. Refresh after the local index is available.",
                  history_unavailable: true,
                },
        });
      });
      await page.evaluate(() =>
        window.dispatchEvent(
          new PageTransitionEvent("pageshow", { persisted: true }),
        ),
      );
      await pending;
      await page.evaluate(() =>
        window.fixtureStreams[0].emitEvent("unavailable", {
          error:
            "Cannot read the Codex conversation archive state. Refresh after the local index is available.",
        }),
      );
      await page.locator("#refresh").click();
      await page.waitForFunction(
        () =>
          !document.getElementById("send").disabled &&
          !document.getElementById("refresh").disabled &&
          window.fixtureStreams.length === 2,
      );
      const response = page.waitForResponse(
        (res) =>
          new URL(res.url()).pathname === "/api/sessions/" + session.id &&
          res.status() === (reply === "archived" ? 410 : 400),
      );
      release();
      await response;
      await page.waitForTimeout(20);
      assert.equal(await page.locator("#title").innerText(), session.title);
      assert(
        await page.locator("#send").isEnabled(),
        "an earlier archive-state response disabled a newer confirmed owner",
      );
      assert.equal(
        await page.locator("#message").inputValue(),
        "Keep the refreshed conversation draft.",
      );
      assert.equal(
        await page.evaluate(() => window.fixtureStreams[1].closed),
        false,
      );
      await f.clean();
    });

  test(`${engine}: an older engine cannot silently steer when durable queueing is unavailable`, async (t) => {
    const f = await fixture(t, engine, {
      catalog: { capabilities: { ...catalog.capabilities, queue: false } },
      state: {
        live: {
          status: "inProgress",
          turn_id: "old-engine-turn",
          items: [],
          requests: [],
        },
      },
    });
    const { page, seen } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page
      .locator("#message")
      .fill("Keep this draft until queueing is available.");
    assert(await page.locator("#send").isDisabled());
    await page
      .locator("#composerHint")
      .filter({
        hasText: "Update agentTools on your computer to queue messages.",
      })
      .waitFor();
    await page.locator("#composer").dispatchEvent("submit");
    assert.equal(
      seen.posts.filter(
        (post) =>
          post.path.endsWith("/queue") ||
          post.path.endsWith("/steer") ||
          post.path.endsWith("/turn"),
      ).length,
      0,
    );
    assert.equal(
      await page.locator("#message").inputValue(),
      "Keep this draft until queueing is available.",
    );
    await f.clean();
  });

  test(`${engine}: computer-use app consent persists only the explicitly offered authorization scope`, async (t) => {
    for (const scenario of [
      {
        capability: true,
        persist: "session",
        action: "Allow this conversation",
        expected: "session",
      },
      {
        capability: true,
        persist: ["session", "always"],
        action: "Always allow this app",
        expected: "always",
      },
      {
        capability: true,
        persist: "session",
        action: "Allow this conversation",
        expected: "session",
        late: true,
      },
      {
        capability: false,
        persist: ["session", "always"],
        action: "Submit answer",
      },
    ]) {
      const request = {
        id: "app-consent",
        method: "mcpServer/elicitation/request",
        params: {
          mode: "form",
          message: "Allow access to the music app?",
          requestedSchema: { type: "object", properties: {} },
          _meta: {
            codex_approval_kind: "mcp_tool_call",
            connector_id: "computer-use",
            tool_params: { app: "com.tencent.QQMusicMac" },
            tool_params_display: [{ name: "app", value: "QQ音乐" }],
            persist: scenario.persist,
          },
        },
      };
      const f = await fixture(t, engine, {
        catalog: {
          capabilities: {
            ...catalog.capabilities,
            app_approval_persistence: scenario.capability,
          },
        },
        ...(scenario.late
          ? {
              catalogForRequest: (query) => ({
                capabilities: {
                  ...catalog.capabilities,
                  app_approval_persistence: !!query.thread,
                },
              }),
            }
          : {}),
        state: {
          live: {
            status: "inProgress",
            turn_id: "app-turn",
            items: [],
            requests: [request],
          },
        },
      });
      const { page, seen } = f;
      await page.locator('#sessions button[data-id="remote-rich"]').click();
      await page.locator("#requestDialog[open]").waitFor();
      if (scenario.capability) {
        await page
          .getByRole("button", { name: scenario.action, exact: true })
          .waitFor();
        assert.equal(
          await page.locator("#requestTitle").innerText(),
          "Allow app access?",
        );
        assert.equal(
          await page.locator(".app-consent-name").innerText(),
          "QQ音乐",
        );
        await page
          .getByText(
            "Full access controls files and commands. App authorization is managed separately.",
            { exact: true },
          )
          .waitFor();
        assert.equal(
          await page
            .getByRole("button", { name: "Always allow this app", exact: true })
            .count(),
          scenario.expected === "always" ? 1 : 0,
          "the UI offered a persistence scope absent from the native request",
        );
        if (scenario.expected === "always")
          await screenshot(page, `workspace-app-consent-${engine}-1440.png`);
      } else {
        assert.equal(
          await page
            .getByRole("button", { name: "Always allow this app", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await page
            .getByRole("button", {
              name: "Allow this conversation",
              exact: true,
            })
            .count(),
          0,
        );
      }
      await page
        .getByRole("button", { name: scenario.action, exact: true })
        .click();
      await page.locator("#requestDialog").waitFor({ state: "hidden" });
      assert.deepEqual(
        seen.posts.find((post) => post.path.endsWith("/answer")).data,
        {
          id: "app-consent",
          decision: "accept",
          content: {},
          ...(scenario.expected
            ? { _meta: { persist: scenario.expected } }
            : {}),
        },
      );
      await f.clean();
    }
  });

  test(`${engine}: native history pages stay exhausted after refresh and cross-project options follow the selected conversation`, async (t) => {
    const makeItems = (first, last) =>
      Array.from({ length: last - first + 1 }, (_, i) => ({
        id: "item-" + (first + i),
        type: "agentMessage",
        text: "History response " + (first + i),
      }));
    const other = {
      id: "docs-session",
      title: "Docs session",
      cwd: otherProject,
      last: session.last,
    };
    const historyPages = {
      "older-3": {
        items: makeItems(201, 300),
        has_more: true,
        next_cursor: "older-2",
      },
      "older-2": {
        items: makeItems(101, 200),
        has_more: true,
        next_cursor: "older-1",
      },
      "older-1": { items: makeItems(1, 100), has_more: false, next_cursor: "" },
    };
    const f = await fixture(t, engine, {
      rows: [session, other],
      projects: [project, otherProject],
      state: { historyItems: makeItems(301, 400), historyCursor: "older-3" },
      historyPages,
    });
    const { page, seen, state } = f;
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page
      .locator("#cwd")
      .filter({ hasText: project })
      .waitFor({ state: "attached" });
    await page.locator('#sessions button[data-id="docs-session"]').click();
    await page
      .locator("#cwd")
      .filter({ hasText: otherProject })
      .waitFor({ state: "attached" });
    await page.waitForFunction(
      () => document.getElementById("breadcrumbProject").textContent === "docs",
    );
    await page.locator("#model").click();
    await page.locator("#reasoningModel").click();
    await page.locator("#menu:visible").waitFor();
    await page.keyboard.press("Escape");
    assert.deepEqual(seen.options.at(-1), {
      project: otherProject,
      thread: other.id,
    });
    await page.locator('#sessions button[data-id="remote-rich"]').click();
    await page
      .locator("#cwd")
      .filter({ hasText: project })
      .waitFor({ state: "attached" });
    await menu(page, "model", "Codex Fast");
    await menu(page, "effort", "High");
    await page.locator("#message").fill("Keep this unsent draft.");
    for (const count of [200, 300, 400]) {
      await page.locator("#older").click();
      await page.waitForFunction(
        (n) => document.querySelectorAll("#history > article").length === n,
        count,
      );
    }
    await page.locator("#older").waitFor({ state: "hidden" });
    await page.locator("#refresh").click();
    assert.equal(
      await page.locator("#older").isHidden(),
      true,
      "refresh resurrected exhausted native-history cursor",
    );
    assert.equal(await page.locator("#history > article").count(), 400);
    assert.equal(
      await page.locator("#history > article .markdown").first().innerText(),
      "History response 1",
    );
    assert.equal(
      await page.locator("#history > article .markdown").last().innerText(),
      "History response 400",
    );
    assert.equal(
      await page.locator("#message").inputValue(),
      "Keep this unsent draft.",
    );
    assert.match(await page.locator("#model").innerText(), /Codex Fast/);
    assert.match(await page.locator("#effort").innerText(), /High/);
    assert.deepEqual(seen.history, ["older-3", "older-2", "older-1"]);
    assert.deepEqual(seen.options.at(-1), { project, thread: session.id });
    historyPages["new-base"] = {
      items: makeItems(401, 500),
      has_more: true,
      next_cursor: "older-3",
    };
    state.historyItems = makeItems(501, 600);
    state.historyCursor = "new-base";
    await page.locator("#refresh").click();
    await page.waitForFunction(
      () => !document.getElementById("refresh").disabled,
    );
    assert.equal(
      await page.locator("#history > article").count(),
      500,
      "refresh discarded previously loaded history",
    );
    assert.equal(
      await page.locator("#older").isVisible(),
      true,
      "a new latest-history boundary must expose its missing middle page",
    );
    await page.locator("#older").click();
    await page.waitForFunction(
      () => document.querySelectorAll("#history > article").length === 600,
    );
    const chronological = await page
      .locator("#history > article .markdown")
      .allTextContents();
    const mismatch = chronological.findIndex(
      (text, index) => text !== "History response " + (index + 1),
    );
    assert.equal(
      mismatch,
      -1,
      `history boundary rollover lost chronological order at ${mismatch}: ${chronological[mismatch]}`,
    );
    assert.equal(
      await page.locator("#message").inputValue(),
      "Keep this unsent draft.",
    );
    await f.clean();
  });

  test(`${engine}: phone workspace navigation, Chinese controls and changed-file drawer fit 390px`, async (t) => {
    const f = await fixture(t, engine, {
      width: 390,
      locale: "zh-CN",
      state: {
        historyItems: richItems(),
        live: {
          status: "completed",
          turn_id: "turn-1",
          items: [],
          requests: [],
          diff: patch("before", "final"),
        },
      },
    });
    const { page } = f;
    await page.locator("#sidebarToggle").click();
    await page.locator("#sessions button").click();
    await page.locator("#history .agent h1").waitFor();
    assert(
      !(await page
        .locator("body")
        .evaluate((body) => body.classList.contains("nav-open"))),
    );
    await menu(page, "model", "Codex Fast");
    await page.locator("#permission").click();
    await page
      .locator("#menu")
      .getByRole("menuitemradio")
      .filter({ has: page.getByText("请求批准", { exact: true }) })
      .click();
    assert.match(await page.locator("#permission").innerText(), /请求批准/);
    await page.locator("#changesToggle").click();
    await page.locator("#changesPanel:visible").waitFor();
    assert.match(await page.locator("#changesContent").innerText(), /final/);
    await screenshot(page, `workspace-rich-${engine}-390.png`);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "phone document overflows horizontally",
    );
    const panel = await page.locator("#changesPanel").boundingBox();
    assert(
      panel.x >= 0 && panel.x + panel.width <= 391,
      "changes drawer overflows phone",
    );
    await page.locator("#closeChanges").click();
    await page.locator("#message").fill("请检查购物车。");
    assert(await page.locator("#send").isEnabled());
    await screenshot(page, `workspace-chat-${engine}-390.png`);
    await f.clean();
  });
}

for (const engine of engines)
  for (const locale of ["en-US", "zh-CN", "zh-TW", "ja-JP", "de-DE"]) {
    test(`${engine}: workspace translations ${locale}`, async (t) => {
      const f = await fixture(t, engine, {
        width: 390,
        locale,
        state: {
          pendingPlan: {
            id: "translated-plan",
            text: "Inspect before making changes.",
            turn_id: "translated-plan-turn",
          },
          live: {
            status: "completed",
            turn_id: "translated-plan-turn",
            items: [],
            requests: [],
          },
          sessionOptions: { ...defaults, mode: "plan" },
        },
      });
      const { page, state } = f;
      const expected = {
        "en-US": "en",
        "zh-CN": "zh",
        "zh-TW": "zh-TW",
        "ja-JP": "ja",
        "de-DE": "de",
      }[locale];
      assert.equal(await page.locator("html").getAttribute("lang"), expected);
      const failures = await page.evaluate((lang) => {
        const dictionary = window.REMOTE_I18N[lang] || {};
        const problems = [];
        for (const node of document.querySelectorAll("[data-t]")) {
          if (lang !== "en" && !dictionary[node.dataset.t])
            problems.push("missing: " + node.dataset.t);
        }
        const heading = document.querySelector("#welcome h2");
        if (
          heading.textContent !==
          (dictionary[heading.dataset.t] || heading.dataset.t)
        )
          problems.push("untranslated welcome");
        return problems;
      }, expected);
      assert.deepEqual(failures, []);
      await page.locator("#model").click();
      assert(await page.locator("#reasoningCard").isVisible());
      const reasoningCard = await page
        .locator("#reasoningCard")
        .evaluate((card) => {
          const rect = card.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: innerWidth,
            height: innerHeight,
            overflow: card.scrollWidth > card.clientWidth,
          };
        });
      assert(
        reasoningCard.left >= 0 &&
          reasoningCard.right <= reasoningCard.width + 1 &&
          reasoningCard.top >= 0 &&
          reasoningCard.bottom <= reasoningCard.height + 1 &&
          !reasoningCard.overflow,
        "translated reasoning card exceeds the phone viewport: " +
          JSON.stringify(reasoningCard),
      );
      if (locale === "zh-CN")
        await screenshot(page, `workspace-reasoning-${engine}-390.png`);
      await page.locator("#reasoningModel").click();
      assert(await page.locator("#menu").isVisible());
      await page.keyboard.press("Escape");
      await page.locator("#sidebarToggle").click();
      await page.locator('#sessions button[data-id="remote-rich"]').click();
      await page.locator("#planAction:visible").waitFor();
      await page.waitForFunction(
        () =>
          document.getElementById("sidebar").getBoundingClientRect().right <= 1,
      );
      await page.locator("#continuePlanning").click();
      await page.locator("#revisePlanDialog[open]").waitFor();
      const modal = await page
        .locator("#revisePlanDialog")
        .evaluate((dialog, lang) => {
          const dictionary = window.REMOTE_I18N[lang] || {},
            rect = dialog.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: innerWidth,
            height: innerHeight,
            scrollWidth: dialog.scrollWidth,
            clientWidth: dialog.clientWidth,
            untranslated: [...dialog.querySelectorAll("[data-t]")]
              .filter(
                (node) =>
                  node.textContent !==
                  (dictionary[node.dataset.t] || node.dataset.t),
              )
              .map((node) => node.dataset.t),
            placeholder: document.getElementById("planFeedback").placeholder,
            expectedPlaceholder:
              dictionary["Describe your additions, changes, or constraints."] ||
              "Describe your additions, changes, or constraints.",
          };
        }, expected);
      assert(
        modal.left >= 0 &&
          modal.right <= modal.width + 1 &&
          modal.top >= 0 &&
          modal.bottom <= modal.height + 1,
        "translated revision dialog exceeds phone viewport: " +
          JSON.stringify(modal),
      );
      assert(
        modal.scrollWidth <= modal.clientWidth + 1,
        "translated revision dialog overflows horizontally: " +
          JSON.stringify(modal),
      );
      assert.deepEqual(modal.untranslated, []);
      assert.equal(modal.placeholder, modal.expectedPlaceholder);
      await page.locator("#planFeedback").fill("Add a verification step.");
      if (locale === "zh-CN")
        await screenshot(page, `workspace-plan-revision-${engine}-390.png`);
      await page.locator("#cancelRevisePlan").click();
      await page.locator("#permission").click();
      const approvalMenu = await page
        .locator("#menu")
        .evaluate((menu, lang) => {
          const dictionary = window.REMOTE_I18N[lang] || {},
            translated = (key) => dictionary[key] || key,
            bounds = menu.getBoundingClientRect();
          const names = ["Ask for approval", "Approve for me", "Full access"];
          const descriptions = [
            "Always ask before editing external files or using the internet.",
            "Only ask for actions detected as potentially unsafe.",
            "Unrestricted access to the internet and any file on this computer.",
          ];
          return {
            labels: [...menu.querySelectorAll(".menu-copy > span")].map(
              (item) => item.textContent,
            ),
            expectedLabels: names.map(translated),
            descriptions: [...menu.querySelectorAll(".menu-copy > small")].map(
              (item) => item.textContent,
            ),
            expectedDescriptions: descriptions.map(translated),
            missing:
              lang === "en"
                ? []
                : [...names, ...descriptions].filter((key) => !dictionary[key]),
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            bottom: bounds.bottom,
            width: innerWidth,
            height: innerHeight,
            scrollWidth: menu.scrollWidth,
            clientWidth: menu.clientWidth,
          };
        }, expected);
      assert.deepEqual(approvalMenu.labels, approvalMenu.expectedLabels);
      assert.deepEqual(
        approvalMenu.descriptions,
        approvalMenu.expectedDescriptions,
      );
      assert.deepEqual(
        approvalMenu.missing,
        [],
        "approval mode translations are missing",
      );
      assert(
        approvalMenu.left >= 0 &&
          approvalMenu.right <= approvalMenu.width + 1 &&
          approvalMenu.top >= 0 &&
          approvalMenu.bottom <= approvalMenu.height + 1 &&
          approvalMenu.scrollWidth <= approvalMenu.clientWidth + 1,
        "translated approval menu overflows phone: " +
          JSON.stringify(approvalMenu),
      );
      if (locale === "zh-CN")
        await screenshot(page, `workspace-permissions-${engine}-390.png`);
      await page.keyboard.press("Escape");
      state.live = {
        status: "inProgress",
        turn_id: "translated-queue-turn",
        items: [],
        requests: [],
      };
      state.pendingPlan = null;
      await page.locator("#sidebarToggle").click();
      await page.locator("#refresh").click();
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () =>
          document.getElementById("sidebar").getBoundingClientRect().right <= 1,
      );
      await page
        .locator("#message")
        .fill("Keep this message waiting while the current task runs.");
      await page.locator("#send").click();
      await page.locator("#queueList [data-queue-id]").waitFor();
      const queued = await page
        .locator("#queuePanel")
        .evaluate((panel, lang) => {
          const dictionary = window.REMOTE_I18N[lang] || {},
            rect = panel.getBoundingClientRect();
          const value = (key) => dictionary[key] || key;
          return {
            left: rect.left,
            right: rect.right,
            width: innerWidth,
            scrollWidth: panel.scrollWidth,
            clientWidth: panel.clientWidth,
            title: document.getElementById("queueTitle").textContent,
            expectedTitle: value("Queued messages"),
            status: panel.querySelector(".queue-status").textContent,
            expectedStatus: value("Waiting"),
            edit: panel.querySelector(".queue-edit").getAttribute("aria-label"),
            expectedEdit: value("Edit queued message"),
            steer: panel.querySelector(".queue-steer").textContent,
            expectedSteer: value("Steer"),
            remove: panel
              .querySelector(".queue-remove")
              .getAttribute("aria-label"),
            expectedRemove: value("Remove queued message"),
            send: document.getElementById("send").getAttribute("aria-label"),
            expectedSend: value("Queue message"),
          };
        }, expected);
      assert(
        queued.left >= 0 &&
          queued.right <= queued.width + 1 &&
          queued.scrollWidth <= queued.clientWidth + 1,
        "translated queue overflows phone: " + JSON.stringify(queued),
      );
      for (const key of ["title", "status", "edit", "steer", "remove", "send"])
        assert.equal(
          queued[key],
          queued["expected" + key[0].toUpperCase() + key.slice(1)],
        );
      if (locale === "zh-CN")
        await screenshot(page, `workspace-queue-${engine}-390.png`);
      state.live = {
        ...state.live,
        owner: {
          kind: "remote",
          state: "connected",
          epoch: "context-owner",
          capabilities: {
            send: true,
            queue: true,
            steer: true,
            interrupt: true,
            answer: true,
            configure: true,
            plan: true,
          },
        },
        context: {
          used_tokens: 64000,
          window_tokens: 128000,
          used_percent: 50,
          compaction: { status: "inProgress", id: "phone-context" },
        },
      };
      await page.evaluate(() =>
        document.dispatchEvent(new Event("visibilitychange")),
      );
      await page.locator("#contextBar:visible").waitFor();
      const context = await page
        .locator("#contextBar")
        .evaluate((bar, lang) => {
          const dictionary = window.REMOTE_I18N[lang] || {},
            rect = bar.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            width: innerWidth,
            text: bar.textContent,
            expected:
              dictionary["Compacting context…"] || "Compacting context…",
          };
        }, expected);
      assert(
        context.left >= 0 && context.right <= context.width + 1,
        "context usage overflows phone: " + JSON.stringify(context),
      );
      assert(context.text.includes(context.expected));
      assert.match(
        await page.locator("#contextUsageText").textContent(),
        /50%/,
      );
      await page.locator("#contextUsage").click();
      await page.locator("#contextUsageDialog[open]").waitFor();
      const usageDialog = await page
        .locator("#contextUsageDialog")
        .evaluate((dialog) => {
          const rect = dialog.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: innerWidth,
            height: innerHeight,
            overflow: dialog.scrollWidth > dialog.clientWidth,
          };
        });
      assert(
        usageDialog.left >= 0 &&
          usageDialog.right <= usageDialog.width + 1 &&
          usageDialog.top >= 0 &&
          usageDialog.bottom <= usageDialog.height + 1 &&
          !usageDialog.overflow,
        "translated context details overflow the phone: " +
          JSON.stringify(usageDialog),
      );
      assert.match(
        await page.locator("#contextUsageSummary").innerText(),
        /50%/,
      );
      if (locale === "zh-CN")
        await screenshot(page, `workspace-context-${engine}-390.png`);
      await page.keyboard.press("Escape");

      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await f.clean();
    });
  }
