const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { buildSync, transformSync } = require("esbuild");

const presentation = { exports: {} };
vm.runInNewContext(
  buildSync({
    entryPoints: [
      path.resolve(__dirname, "../web/src/features/presentation.js"),
    ],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
  }).outputFiles[0].text,
  { module: presentation, URL },
);
const source = transformSync(
  fs.readFileSync(
    path.resolve(__dirname, "../web/src/features/conversation.jsx"),
    "utf8",
  ),
  { loader: "jsx", format: "cjs", jsx: "automatic" },
).code;

function fixture(options = {}) {
  const module = { exports: {} };
  let output;
  vm.runInNewContext(source, {
    module,
    require: (name) =>
      name === "./presentation"
        ? presentation.exports
        : name === "../render"
          ? {
              renderView: (_, nodes) => {
                output = nodes;
              },
            }
          : name === "react/jsx-runtime" || name === "react"
            ? require(name)
            : {},
  });
  return {
    ...module.exports.createConversation({ t: (value) => value, ...options }),
    output: () => output,
  };
}

test("long history groups turn summaries with one bounded scan and one change inventory", () => {
  let turnReads = 0,
    changeReads = 0;
  const items = Array.from({ length: 1200 }, (_, index) => ({
    id: "item-" + index,
    type: "agentMessage",
    text: "Synthetic answer " + index,
    get turn_id() {
      turnReads++;
      return "turn-" + Math.floor(index / 4);
    },
  }));
  const f = fixture({
    getAllItems: () => items,
    getChangedFiles: () => {
      changeReads++;
      return [{ path: "src/example.js", turn_id: "turn-0" }];
    },
  });
  f.renderItems({ id: "history" }, items);
  const summaries = f
    .output()
    .filter((node) => node?.type?.name === "TurnSummary");
  assert.equal(summaries.length, 300);
  for (const [index, summary] of summaries.entries()) {
    assert.equal(summary.props.id, "turn-" + index);
    assert.equal(summary.props.items.length, 4);
    assert.equal(summary.props.items[0], items[index * 4]);
    summary.type(summary.props);
  }
  assert(
    turnReads < items.length * 10,
    "each turn rescanned the full message history: " + turnReads,
  );
  assert.equal(changeReads, 1, "each summary rebuilt the full file inventory");
});

test("history updates preserve item identity, ordering and insertion anchors without mutating input", () => {
  const f = fixture();
  const first = Object.freeze({ id: "first", text: "first" });
  const middle = Object.freeze({ id: "middle", text: "middle" });
  const last = Object.freeze({ id: "last", text: "last" });
  const existing = Object.freeze([first, middle, last]);
  const changed = Object.freeze({ ...middle, text: "updated" });
  const replaced = f.mergeOrdered(existing, [changed, first, changed]);
  assert.deepEqual(
    Array.from(replaced, (item) => item.id),
    ["first", "middle", "last"],
  );
  assert.equal(replaced[0], first);
  assert.equal(replaced[1], changed);
  assert.equal(replaced[2], last);
  assert.equal(existing[1], middle);
  const older = { id: "older" },
    next = { id: "next" };
  assert.deepEqual(
    Array.from(
      f.mergeOrdered(existing, [older, middle, next, last]),
      (item) => item.id,
    ),
    ["first", "older", "middle", "next", "last"],
  );
  assert.deepEqual(
    Array.from(
      f.mergeOrdered(existing, [older, next], true, "middle"),
      (item) => item.id,
    ),
    ["first", "older", "next", "middle", "last"],
  );
  assert.equal(f.mergeOrdered(existing, []), existing);
});
