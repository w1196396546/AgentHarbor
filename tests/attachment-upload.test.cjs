const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { File } = require("node:buffer");
const { test } = require("node:test");
const { buildSync, transformSync } = require("esbuild");

const capabilities = { exports: {} };
vm.runInNewContext(
  buildSync({
    entryPoints: [
      path.resolve(__dirname, "../web/src/features/owner-capabilities.js"),
    ],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
  }).outputFiles[0].text,
  { module: capabilities },
);

function fixture() {
  const requests = [],
    notices = [],
    cleanups = [],
    revoked = [];
  let rendered = [],
    downloads = 0;
  const module = { exports: {} };
  const source = transformSync(
    fs.readFileSync(
      path.resolve(__dirname, "../web/src/features/attachments.jsx"),
      "utf8",
    ),
    {
      loader: "jsx",
      format: "cjs",
      jsxFactory: "jsx",
    },
  ).code;
  vm.runInNewContext(source, {
    module,
    FormData,
    URLSearchParams,
    AbortController,
    URL: {
      createObjectURL: (file) => "blob:" + file.name,
      revokeObjectURL: (url) => revoked.push(url),
    },
    window: {
      RemoteSecure: {
        fetch: () => {
          downloads++;
          assert.fail("preview downloaded the uploaded image");
        },
      },
    },
    jsx: (type, props, ...children) => ({ type, props, children }),
    require: (name) => {
      if (name === "./owner-capabilities") return capabilities.exports;
      if (name === "react")
        return {
          useState: (value) => [value, () => {}],
          useEffect: (effect) => cleanups.push(effect()),
        };
      if (name === "../render")
        return {
          renderView: (_, rows) => {
            rendered = rows;
          },
        };
      if (name.endsWith("RemoteIcon")) return { RemoteIcon: "Icon" };
      if (name.endsWith("/tag")) return { Tag: "Tag" };
      assert.fail("unexpected import: " + name);
    },
  });
  const state = {
    project: "/project",
    generation: 1,
    uploading: 0,
    attachments: [],
    mentions: [],
    skills: [],
    tools: [],
  };
  const attachments = module.exports.createAttachments({
    state,
    requireOwner: () => {},
    notice: (message) => notices.push(message),
    updateControls: () => {},
    projectName: (name) => name,
    $: () => ({}),
    t: (value) => value,
    run: (task) => task(),
    getAgent: () => ({ id: "codex" }),
    api: (url, form, options) => {
      if (options?.method === "DELETE") {
        requests.push({ url, deleted: true });
        return Promise.resolve();
      }
      return new Promise((resolve, reject) =>
        requests.push({ url, form, resolve, reject }),
      );
    },
  });
  return {
    state,
    attachments,
    requests,
    notices,
    revoked,
    cleanups,
    rows: () => rendered,
    downloads: () => downloads,
  };
}
const tick = () => new Promise(setImmediate);

test("uploads overlap in bounded pairs, preserve selection order and preview images locally", async () => {
  const f = fixture();
  const work = f.attachments.upload([
    new File(["one"], "one.png"),
    new File(["two"], "two.txt"),
    new File(["three"], "three.txt"),
  ]);
  assert.equal(f.requests.length, 2);
  assert.equal(f.state.uploading, 2);
  f.requests[1].resolve({ id: "two", name: "two.txt" });
  await tick();
  assert.equal(
    f.requests.length,
    2,
    "an unfinished pair exceeded the concurrency bound",
  );
  f.requests[0].resolve({ id: "one", name: "one.png", image: true });
  await tick();
  assert.deepEqual(
    f.state.attachments.map((row) => row.id),
    ["one", "two"],
  );
  assert.equal(f.requests.length, 3);
  const image = f.rows()[0].props.icon;
  assert.equal(image.type(image.props).props.src, "blob:one.png");
  assert.equal(f.downloads(), 0);
  f.cleanups[0]();
  assert.deepEqual(f.revoked, ["blob:one.png"]);
  f.requests[2].reject(new Error("Upload failed"));
  await work;
  assert.equal(f.state.uploading, 0);
  assert.deepEqual(f.notices, ["Upload failed"]);
  assert.equal(
    f.state.attachments.length,
    2,
    "failure lost completed attachments",
  );
});

test("oversized files are skipped and navigation prevents later upload batches", async () => {
  const f = fixture();
  const work = f.attachments.upload([
    { size: 21 * 1024 * 1024 },
    new File(["old"], "old.png"),
    new File(["later"], "later.txt"),
  ]);
  assert.equal(f.requests.length, 1);
  assert.match(f.notices[0], /20 MB/);
  f.state.project = "/other";
  f.state.generation++;
  f.requests[0].resolve({ id: "old", name: "old.png", image: true });
  await work;
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].url, "attachments/old");
  assert.equal(f.requests[1].deleted, true);
  assert.equal(f.state.uploading, 0);
  assert.equal(f.state.attachments.length, 0);
});
