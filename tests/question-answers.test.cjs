const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const modulePromise = fs
  .readFile(
    path.join(__dirname, "../web/src/features/question-answers.js"),
    "utf8",
  )
  .then(
    (source) =>
      import(
        "data:text/javascript;base64," + Buffer.from(source).toString("base64")
      ),
  );

test("multi-select answers keep every choice and optional free text without duplicates", async () => {
  const { questionFormAnswers } = await modulePromise;
  const form = new FormData();
  form.append("0", "First");
  form.append("0", "Second");
  form.append("0", "First");
  form.append("0-text", "  Other  ");
  const answers = questionFormAnswers([{ id: "0", multiSelect: true }], form);
  assert.deepEqual(answers["0"], ["First", "Second", "Other"]);
  form.set("0-text", "First");
  assert.deepEqual(
    questionFormAnswers([{ id: "0", multiSelect: true }], form)["0"],
    ["First", "Second"],
  );
});

test("single-select answers preserve the existing free-text precedence", async () => {
  const { questionFormAnswers } = await modulePromise;
  const form = new FormData();
  form.append("choice", "Default");
  assert.equal(questionFormAnswers([{ id: "choice" }], form).choice, "Default");
  form.append("choice-text", "  Custom  ");
  assert.equal(questionFormAnswers([{ id: "choice" }], form).choice, "Custom");
  form.set("choice-text", "   ");
  assert.throws(
    () => questionFormAnswers([{ id: "choice" }], form),
    /Answer every question/,
  );
});

test("every question requires an answer, including free-text-only multi-select", async () => {
  const { questionFormAnswers } = await modulePromise;
  for (const multiSelect of [false, true]) {
    assert.throws(
      () =>
        questionFormAnswers([{ id: "missing", multiSelect }], new FormData()),
      /Answer every question/,
    );
  }
  const form = new FormData();
  form.set("multi-text", "Only custom");
  assert.deepEqual(
    questionFormAnswers([{ id: "multi", multiSelect: true }], form).multi,
    ["Only custom"],
  );
  assert.throws(
    () =>
      questionFormAnswers(
        [{ id: "multi", multiSelect: true }, { id: "missing" }],
        form,
      ),
    /Answer every question/,
  );
});

test("native question identifiers remain own properties without prototype mutation", async () => {
  const { questionFormAnswers } = await modulePromise;
  const form = new FormData();
  form.set("__proto__", "value");
  form.set("constructor", "another");
  const answers = questionFormAnswers(
    [{ id: "__proto__" }, { id: "constructor" }],
    form,
  );
  assert.equal(Object.getPrototypeOf(answers), null);
  assert.equal(answers.__proto__, "value");
  assert.equal(answers.constructor, "another");
  assert.deepEqual(JSON.parse(JSON.stringify(answers)), {
    ["__proto__"]: "value",
    constructor: "another",
  });
});
