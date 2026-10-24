const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");

async function source(name) {
  const text = await fs.readFile(
    path.resolve(__dirname, "../web/src/features/" + name + ".js"),
    "utf8",
  );
  return import(
    "data:text/javascript;base64," + Buffer.from(text).toString("base64")
  );
}

test("interaction observation keeps unknown outcomes and excludes secret answers from search", async () => {
  const { normalizeInteractions, interactionItems } = await source(
    "interaction-history",
  );
  const values = [
    {
      request_id: "one",
      status: "approved",
      item_id: "tool-one",
      turn_id: "turn",
      summary: "Read file",
      reason: "User approved",
      answers: { secret: "private" },
      resolved_at_ms: 10,
    },
    {
      request_id: "two",
      status: "completed",
      content: "private",
      resolved_at_ms: 0,
    },
    { request_id: "three", status: "pending", summary: "Waiting" },
    { request_id: "four", status: "answered", resolved_at_ms: 1e30 },
  ];
  const result = normalizeInteractions(values);
  assert.equal(
    result[1].status,
    "unknown",
    "request completion alone proves no decision",
  );
  assert.equal(result[1].resolved_at_ms, undefined);
  assert.equal(result[3].resolved_at_ms, undefined);
  assert.equal(JSON.stringify(result).includes("private"), false);
  const items = interactionItems(values);
  assert.equal(
    items.length,
    3,
    "pending requests keep their existing approval entry",
  );
  assert.equal(items[0].source_item_id, "tool-one");
  assert.match(items[0].text, /User approved/);
  assert.equal(JSON.stringify(items).includes("private"), false);
});

test("agent graph preserves paged operations and known summaries without cycling", async () => {
  const { agentTree, mergeAgentGraph } = await source("agent-graph");
  const nodes = [
    { id: "grandchild", parent_id: "child" },
    {
      id: "child",
      parent_id: "parent",
      task: "Review",
      result_summary: "Findings",
      latest_operation: { id: "latest" },
      operations: [{ id: "new", item_id: "source" }],
    },
    { id: "cycle-a", parent_id: "cycle-b" },
    { id: "cycle-b", parent_id: "cycle-a" },
  ];
  const tree = agentTree(nodes);
  assert.equal(tree[0].agent.id, "child");
  assert.equal(tree[0].children[0].agent.id, "grandchild");
  const ids = [];
  function visit(branch) {
    ids.push(branch.agent.id);
    branch.children.forEach(visit);
  }
  tree.forEach(visit);
  assert.equal(new Set(ids).size, 4);
  assert.equal(ids.length, 4);
  const result = mergeAgentGraph(nodes, [
    {
      id: "child",
      task: "",
      result_summary: "Older findings",
      operations: [{ id: "new" }, { id: "old" }],
      latest_operation: { id: "old" },
    },
  ]);
  const child = result.agents.find((value) => value.id === "child");
  assert.equal(child.task, "Review");
  assert.equal(
    child.result_summary,
    "Findings",
    "older pages cannot overwrite the latest known result",
  );
  assert.equal(child.latest_operation.id, "latest");
  assert.deepEqual(
    child.operations.map((value) => value.id),
    ["new", "old"],
  );
  const capped = mergeAgentGraph(
    result.agents,
    [{ id: "child", operations: [{ id: "older" }] }],
    2,
  );
  assert.equal(capped.truncated, true);
  assert.equal(
    capped.agents.find((value) => value.id === "child").operations.length,
    2,
  );
});
