const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
const { build } = require("esbuild");
const presentation = build({
  entryPoints: [path.resolve(__dirname, "../web/src/features/presentation.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
}).then(
  (result) =>
    import(
      "data:text/javascript;base64," +
        Buffer.from(result.outputFiles[0].text).toString("base64")
    ),
);

test("presentation keeps diff positions and only exposes supplied web targets", async () => {
  const { numberedDiff, searchAction, externalURL, commandSummary } =
    await presentation;
  const rows = numberedDiff(
    "diff --git a/a b/a\n--- /dev/null\n+++ b/a\n@@ -0,0 +8,2 @@\n+one\n+two\n",
    "add",
  );
  assert.equal(
    rows[2].next,
    undefined,
    "file headers must not receive line numbers",
  );
  assert.deepEqual(
    rows.slice(4, 6).map(({ old, next }) => [old, next]),
    [
      [null, 8],
      [null, 9],
    ],
  );
  assert.deepEqual(
    numberedDiff("-old\n+new\n same", "update").map((row) => row.next),
    [undefined, undefined, undefined],
  );
  assert.deepEqual(
    numberedDiff("-one\n-two", "delete").map((row) => [row.old, row.next]),
    [
      [1, null],
      [2, null],
    ],
  );
  assert.equal(
    commandSummary(
      { commandActions: [{ type: "read", path: "src/a.js" }] },
      (value) => value,
    ),
    "Read file · src/a.js",
  );
  assert.deepEqual(
    searchAction({
      action: {
        type: "findInPage",
        url: "https://example.test/doc",
        pattern: "term",
      },
    }),
    {
      label: "Find in page",
      url: "https://example.test/doc",
      query: "term",
      queries: [],
    },
  );
  for (const target of [
    "javascript:alert(1)",
    "file:///private/a",
    "//outside.test/doc",
  ])
    assert.equal(externalURL(target), null);
});

test("shared changes count command writes once per turn and preserve real renames", async () => {
  const {
    collectChanges,
    gitPath,
    resourcePath,
    toolStatus,
    itemResources,
    searchItems,
    errorDetails,
  } = await presentation;
  const state = {
    cwd: "C:\\repo",
    history: [
      {
        id: "rename",
        turn_id: "one",
        type: "fileChange",
        data: {
          changes: [
            {
              path: "C:\\repo\\old.txt",
              kind: { type: "update", move_path: "C:\\repo\\new.txt" },
              diff: "NATIVE",
            },
          ],
        },
      },
    ],
    live: {
      turn_id: "two",
      items: [
        {
          id: "native",
          type: "fileChange",
          data: { changes: [{ path: "C:/repo/src/a.txt", diff: "partial" }] },
        },
      ],
      diff: "diff --git a/src/a.txt b/src/a.txt\n--- a/src/a.txt\n+++ b/src/a.txt\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/command.txt b/command.txt\nnew file mode 100644\n--- /dev/null\n+++ b/command.txt\n@@ -0,0 +1 @@\n+written\n",
    },
    workspaceChanges: [
      { path: "new.txt", turn_id: "one", diff: "WORKSPACE", kind: "add" },
      { path: "old.txt", turn_id: "one", kind: "delete" },
      { path: "C:\\repo\\SRC\\a.txt", turn_id: "two", diff: "complete" },
      { path: "./command.txt", turn_id: "two", diff: "COMMAND" },
      { path: "external.txt", diff: "NO TURN" },
    ],
  };
  assert.equal(gitPath('"a/\\346\\226\\260.txt"'), "a/新.txt");
  assert.equal(gitPath('"a/quote\\\"name.txt"'), 'a/quote"name.txt');
  const unicodeRename = collectChanges({
    cwd: "/repo",
    history: [],
    live: {
      turn_id: "rename",
      items: [
        {
          id: "native-rename",
          type: "fileChange",
          turn_id: "rename",
          data: {
            changes: [
              {
                path: "/repo/旧.txt",
                kind: { type: "update", move_path: "/repo/新.txt" },
              },
            ],
          },
        },
      ],
      diff: 'diff --git "a/\\346\\227\\247.txt" "b/\\346\\226\\260.txt"\nsimilarity index 100%\nrename from "\\346\\227\\247.txt"\nrename to "\\346\\226\\260.txt"\n',
    },
    workspaceChanges: [
      { path: "旧.txt", kind: "delete", turn_id: "rename" },
      { path: "新.txt", kind: "add", turn_id: "rename" },
    ],
  });
  assert.equal(unicodeRename.length, 1);
  assert.equal(unicodeRename[0].old_path, "旧.txt");
  assert.equal(unicodeRename[0].path, "新.txt");
  assert.equal(
    resourcePath({ uri: "file:///repo/hello%20world.png" }),
    "/repo/hello world.png",
  );
  assert.equal(
    resourcePath({ uri: "file:///C:/repo/photo.png" }),
    "C:/repo/photo.png",
  );
  assert.equal(resourcePath({ uri: "file://other-server/private.png" }), "");
  assert.equal(resourcePath({ uri: "https://example.test/image.png" }), "");
  const files = collectChanges(state);
  assert.equal(files.length, 4);
  assert.equal(files.filter((file) => file.turn_id === "two").length, 2);
  const renamed = files.find((file) => file.turn_id === "one");
  assert.equal(renamed.old_path, "old.txt");
  assert.equal(renamed.path, "new.txt");
  assert.equal(renamed.item_id, "rename");
  assert.equal(
    files.find((file) => file.path === "SRC/a.txt").diff,
    "complete",
  );
  assert.equal(
    toolStatus({ status: "completed", data: { exitCode: 2 } }),
    "failed",
  );
  assert.equal(toolStatus({ status: "success" }), "completed");
  assert.equal(
    toolStatus({ type: "mcpToolCall", data: { result: { isError: true } } }),
    "failed",
  );
  const image = {
    id: "image",
    turn_id: "two",
    type: "imageGeneration",
    data: { result: "aGVsbG8=" },
  };
  assert.equal(
    itemResources(image)[0].part.url,
    "data:image/png;base64,aGVsbG8=",
  );
  const linked = itemResources({
    id: "reply",
    type: "agentMessage",
    text: "[Report](reports/result.csv)\n![Chart](/repo/images/chart.png)\n![External](https://example.test/image.png)\n[Web](https://example.test/)\n`[Code](skip.txt)`\n```md\n[Example](example.txt)\n```",
  });
  assert.deepEqual(
    linked.map(({ part }) => part.path || part.url),
    [
      "reports/result.csv",
      "/repo/images/chart.png",
      "https://example.test/image.png",
    ],
  );
  const tool = {
    id: "tool",
    type: "mcpToolCall",
    data: {
      result: {
        content: [
          { type: "text", text: "Needle output" },
          { type: "image", data: "NeedleBase64" },
        ],
      },
    },
  };
  assert.deepEqual(
    searchItems([image, tool], "needle").map((item) => item.id),
    ["tool"],
  );
  assert.deepEqual(searchItems([image, tool], "needlebase64"), []);
  assert.deepEqual(
    searchItems([image, tool], "", "artifacts").map((item) => item.id),
    ["image", "tool"],
  );
  assert.deepEqual(
    errorDetails({
      error_data: {
        error: { message: "rate limited", additionalDetails: "try later" },
        willRetry: true,
      },
    }),
    {
      message: "rate limited",
      details: "try later",
      code: "",
      retrying: true,
      itemID: "",
      turnID: "",
    },
  );
});

test("Windows extended and UNC changes share relative paths, casing and rename identity", async () => {
  const { normalizeFilePath, collectChanges } = await presentation;
  for (const [cwd, absolute, equivalent] of [
    [
      "\\\\?\\E:\\work\\Shop",
      "e:/WORK/shop/src/File.txt",
      "\\\\?\\e:\\work\\SHOP\\SRC\\file.txt",
    ],
    [
      "E:\\work\\Shop",
      "\\\\?\\e:\\WORK\\shop\\src\\File.txt",
      "E:/work/SHOP/SRC/file.txt",
    ],
    [
      "\\\\?\\UNC\\Server\\Share\\Shop",
      "\\\\server\\share\\SHOP\\src\\File.txt",
      "//SERVER/SHARE/shop/SRC/file.txt",
    ],
    [
      "\\\\Server\\Share\\Shop",
      "\\\\?\\UNC\\server\\share\\SHOP\\src\\File.txt",
      "//SERVER/SHARE/shop/SRC/file.txt",
    ],
  ]) {
    assert.equal(normalizeFilePath(absolute, cwd), "src/File.txt");
    const files = collectChanges({
      cwd,
      history: [],
      live: {
        turn_id: "one",
        items: [
          {
            id: "native-change",
            type: "fileChange",
            data: { changes: [{ path: absolute, diff: "NATIVE" }] },
          },
        ],
      },
      workspaceChanges: [
        { path: equivalent, turn_id: "one", diff: "CONFIRMED" },
      ],
    });
    assert.equal(files.length, 1, cwd);
    assert.equal(files[0].diff, "CONFIRMED");
    assert.equal(files[0].item_id, "native-change");
    const renamed = collectChanges({
      cwd,
      history: [],
      live: {
        turn_id: "rename",
        items: [
          {
            id: "native-rename",
            type: "fileChange",
            data: {
              changes: [
                {
                  path: absolute,
                  kind: { type: "update", move_path: "src/New.txt" },
                },
              ],
            },
          },
        ],
      },
      workspaceChanges: [
        { path: equivalent, turn_id: "rename", kind: "delete" },
        {
          path: "SRC/new.txt",
          turn_id: "rename",
          kind: "add",
          diff: "RENAMED",
        },
      ],
    });
    assert.equal(
      renamed.length,
      1,
      "a casing difference restored a renamed source deletion",
    );
    assert.equal(renamed[0].old_path, "src/File.txt");
  }
  assert.equal(
    normalizeFilePath(
      "\\\\?\\E:\\work\\shop-copy\\secret.txt",
      "E:\\work\\shop",
    ),
    "E:/work/shop-copy/secret.txt",
  );
  assert.equal(
    normalizeFilePath("F:\\work\\shop\\secret.txt", "E:\\work\\shop"),
    "F:/work/shop/secret.txt",
  );
  assert.equal(
    normalizeFilePath(
      "\\\\server\\share-other\\secret.txt",
      "\\\\server\\share",
    ),
    "//server/share-other/secret.txt",
  );
  assert.equal(normalizeFilePath("\\\\?\\E:\\file.txt", "E:\\"), "file.txt");
  assert.equal(
    normalizeFilePath("/Work/secret.txt", "/work"),
    "/Work/secret.txt",
  );
});

test("reading metadata is scoped and bounded without message or request bodies", async () => {
  const source = await fs.readFile(
      path.resolve(__dirname, "../web/src/features/reading.js"),
      "utf8",
    ),
    { createReading } = await import(
      "data:text/javascript;base64," + Buffer.from(source).toString("base64")
    );
  const storage = new Map(),
    handlers = new Map(),
    scroll = {
      dataset: {},
      addEventListener: (name, handler) => handlers.set(name, handler),
      querySelectorAll: () => [],
      getBoundingClientRect: () => ({ top: 0 }),
      scrollHeight: 500,
      clientHeight: 100,
      scrollTop: 0,
    };
  const previousStorage = global.localStorage,
    previousWindow = global.window;
  global.localStorage = {
    getItem: (key) => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
  };
  global.window = { addEventListener() {} };
  try {
    const state = { device: { id: "device" }, selected: "one" },
      reading = createReading({
        state,
        $: () => scroll,
        getAgent: () => ({ id: "codex" }),
      });
    Object.assign(reading.get(), {
      expanded: { "item:tool": false },
      changesTurn: "turn-a",
      secret: "do not persist",
      body: "do not persist",
    });
    reading.persist();
    state.selected = "two";
    assert.deepEqual(reading.get().expanded, {});
    state.selected = "one";
    assert.equal(reading.get().expanded["item:tool"], false);
    assert.equal(reading.get().changesTurn, "turn-a");
    reading.get().anchor = "outside-loaded-history";
    assert.equal(reading.get().restore, true);
    handlers.get("wheel")();
    assert.equal(
      reading.get().restore,
      false,
      "actual user navigation must cancel a pending historical anchor",
    );
    state.device.id = "other";
    assert.deepEqual(reading.get().expanded, {});
    for (let i = 0; i < 45; i++) {
      state.selected = "s" + i;
      reading.get().expanded = Object.fromEntries(
        Array.from({ length: 300 }, (_, index) => ["i" + index, true]),
      );
      reading.persist();
    }
    const saved = [...storage.values()][0];
    assert.equal(saved.includes("do not persist"), false);
    const records = JSON.parse(saved);
    assert.equal(records.length, 32);
    assert.equal(Object.keys(records.at(-1).data.expanded).length, 250);
  } finally {
    global.localStorage = previousStorage;
    global.window = previousWindow;
  }
});

test("failed computer checks remain unknown while explicit offline reports remain offline", async () => {
  const source = await fs.readFile(
      path.resolve(__dirname, "../web/src/features/devices.jsx"),
      "utf8",
    ),
    { createDevices } = await import(
      "data:text/javascript;base64," + Buffer.from(source).toString("base64")
    );
  const previousWindow = global.window;
  global.window = {
    RemoteSecure: { available: () => true },
    dispatchEvent() {},
  };
  try {
    const nodes = new Map(),
      state = { device: { id: "device", online: true }, live: {}, catalog: {} },
      $ = (id) => {
        if (!nodes.has(id)) nodes.set(id, { parentElement: { dataset: {} } });
        return nodes.get(id);
      };
    const devices = createDevices({
      state,
      $,
      t: (text) => text,
      nativeSettings: () => false,
      closeStream() {},
      updateControls() {},
      showPair() {},
      api: async () => {
        throw new Error("Fixture read failure");
      },
      showWorkspace() {},
      notice() {},
    });
    await devices.checkDevice();
    clearTimeout(state.deviceTimer);
    devices.updateConnection();
    assert.equal(state.deviceConnectionUnknown, true);
    assert.equal($("connectionLabel").textContent, "Connection unknown");
    assert.equal($("deviceOffline").hidden, true);
    devices.setDeviceOnline(false);
    devices.updateConnection();
    assert.equal(state.deviceConnectionUnknown, false);
    assert.equal($("connectionLabel").textContent, "Your computer is offline");
    assert.equal($("deviceOffline").hidden, false);
  } finally {
    global.window = previousWindow;
  }
});


test("model errors form one retry disclosure and recover without hiding terminal failures", async () => {
  const { modelErrorGroups } = await presentation;
  const retry = (id, attempt, turn = "turn") => ({ id, turn_id: turn, type: "error", data: {
    message: `Reconnecting... ${attempt}/5`, willRetry: true, additionalDetails: "stream disconnected before completion",
  }});
  const items = [retry("one", 1), retry("two", 2)];
  const live = { turn_id: "turn", status: "inProgress", error: "Reconnecting... 2/5", retrying: true };
  let groups = modelErrorGroups(items, live);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].status, "retrying");
  assert.equal(groups[0].data.attempt, "2/5");
  assert.equal(groups[0].data.items.length, 2);
  assert.equal(groups[0].id, "one");
  groups = modelErrorGroups([...items, { id: "answer", type: "agentMessage", turn_id: "turn", text: "resumed" }], { turn_id: "turn", status: "inProgress" });
  assert.equal(groups[0].status, "recovered");
  assert.equal(modelErrorGroups(items, { turn_id: "turn", status: "completed" })[0].status, "recovered");
  assert.equal(modelErrorGroups(items, { turn_id: "turn", status: "interrupted" })[0].status, "ended");
  assert.equal(modelErrorGroups([...items, { id: "failed", turn_id: "turn", type: "error", data: { message: "Retry exhausted", willRetry: false } }])[0].status, "failed");
  assert.equal(modelErrorGroups([items[0], retry("other", 1, "other")]).length, 2);
  assert.equal(modelErrorGroups([items[0], { id: "notice", type: "systemEvent", turn_id: "turn" }])[0].status, "retrying");
  const claude = { id: "claude-retry", type: "error", data: { message: "overloaded_error", willRetry: true, attempt: 3, maxRetries: 5 } };
  groups = modelErrorGroups([claude], { status: "inProgress", turn_id: "native-turn", error: "overloaded_error", error_data: claude.data, retrying: true });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].data.attempt, "3/5");
  assert.equal(modelErrorGroups([{ ...claude, data: { ...claude.data, resolved: true } }])[0].status, "recovered");
  const failed = { id: "failed", type: "error", data: { message: "API Error", willRetry: false } };
  assert.equal(modelErrorGroups([failed, { id: "new-user", type: "userMessage" }, { id: "new-answer", type: "agentMessage" }])[0].status, "failed", "a later user turn must not recover an earlier terminal failure");
  assert.equal(items[0].data.items, undefined, "grouping mutated source history");
});
