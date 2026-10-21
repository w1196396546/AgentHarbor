const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const modulePromise = fs
  .readFile(
    path.join(__dirname, "../web/src/agents/codex-questions.js"),
    "utf8",
  )
  .then(
    (source) =>
      import(
        "data:text/javascript;base64," + Buffer.from(source).toString("base64")
      ),
  );

const question = {
  id: "question",
  type: "agentMessage",
  turn_id: "active",
  data: {
    questions: [
      { title: "Which?", options: ["Windows", "macOS"] },
      { title: "Notes?" },
    ],
  },
};
const live = (items = [question]) => ({
  status: "inProgress",
  turn_id: "active",
  items,
});

test("async questions keep source identities and only accepted same-turn replies resolve them", async () => {
  const { asyncQuestions, asyncQuestionReply, questionReplies } =
    await modulePromise;
  const request = asyncQuestions(live())[0],
    q = request.params.questions;
  assert.equal(q[0].id, '["request_user_input_async","question",0]');
  assert.deepEqual(q[0].options, [{ label: "Windows" }, { label: "macOS" }]);
  const text = asyncQuestionReply([q[0]], { [q[0].id]: "Windows" });
  assert.deepEqual(questionReplies(text), [
    { questionItemId: q[0].id, question: "Which?", answer: "Windows" },
  ]);
  const reply = {
    type: "steeringUserMessage",
    data: { input: [{ type: "text", text }], status: "pending" },
  };
  assert.equal(
    asyncQuestions(live([question, reply]))[0].params.questions.length,
    2,
  );
  reply.data.status = "accepted";
  assert.deepEqual(
    asyncQuestions(live([question, reply]))[0].params.questions.map(
      (q) => q.question,
    ),
    ["Notes?"],
  );
  assert.deepEqual(asyncQuestions({ ...live(), status: "completed" }), []);
  assert.deepEqual(asyncQuestions({ ...live(), turn_id: "next" }), []);
});

test("ordinary messages and malformed question metadata never become replies or controls", async () => {
  const { asyncQuestions, questionReplies } = await modulePromise;
  for (const text of [
    "ordinary reply",
    "<send_user_message_question_reply>bad</send_user_message_question_reply>",
    '<send_user_message_question_reply>[{"questionItemId":1}]</send_user_message_question_reply>',
    "<send_user_message_question_reply>[]</send_user_message_question_reply>",
  ])
    assert.equal(questionReplies(text), null);
  for (const questions of [
    { title: "wrong container" },
    [null],
    [{ title: "" }],
  ])
    assert.deepEqual(
      asyncQuestions(live([{ ...question, data: { questions } }])),
      [],
    );
  const requests = asyncQuestions(
    live([
      { ...question, data: { questions: [{ title: "Valid?", options: {} }] } },
    ]),
  );
  assert.deepEqual(requests[0].params.questions[0].options, []);
});
