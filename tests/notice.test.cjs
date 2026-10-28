const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

test("notices expire and replacement notices get their own timeout", async (context) => {
  const source = await fs.readFile(
    path.join(__dirname, "../web/src/controller.jsx"),
    "utf8",
  );
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const node = { textContent: "" };
  const notice = vm.runInNewContext(
    source.slice(
      source.indexOf("  let noticeTimer;"),
      source.indexOf("  let namingNotice"),
    ) + "; notice",
    { $: () => node, t: (text) => text, setTimeout, clearTimeout },
  );

  notice("First error");
  context.mock.timers.tick(3000);
  assert.equal(node.textContent, "First error");
  notice("Second error");
  context.mock.timers.tick(2000);
  assert.equal(node.textContent, "Second error");
  context.mock.timers.tick(3000);
  assert.equal(node.textContent, "");

  notice("Cleared error");
  context.mock.timers.tick(1000);
  notice();
  assert.equal(node.textContent, "");
  notice("New error");
  context.mock.timers.tick(4000);
  assert.equal(node.textContent, "New error");
  context.mock.timers.tick(1000);
  assert.equal(node.textContent, "");
});
