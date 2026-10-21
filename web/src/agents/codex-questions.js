const open = "<send_user_message_question_reply>";
const close = "</send_user_message_question_reply>";

export function questionReplies(text) {
  if (typeof text !== "string") return null;
  const value = text.trim();
  if (!value.startsWith(open) || !value.endsWith(close)) return null;
  try {
    const parsed = JSON.parse(value.slice(open.length, -close.length));
    const replies = Array.isArray(parsed) ? parsed : [parsed];
    return replies.length &&
      replies.every(
        (reply) =>
          reply &&
          ["questionItemId", "question", "answer"].every(
            (key) => typeof reply[key] === "string",
          ),
      )
      ? replies
      : null;
  } catch {
    return null;
  }
}

export function asyncQuestions(live) {
  if (live.status !== "inProgress" || !live.turn_id) return [];
  const items = live.items || [],
    answered = new Set();
  for (const item of items) {
    const data = item.data || {};
    if (
      item.type !== "userMessage" &&
      !(item.type === "steeringUserMessage" && data.status === "accepted")
    )
      continue;
    const input = item.type === "userMessage" ? data.content : data.input;
    if (input?.length !== 1 || input[0].type !== "text") continue;
    for (const reply of questionReplies(input[0].text) || [])
      answered.add(reply.questionItemId);
  }
  return items.flatMap((item) => {
    if (
      item.type !== "agentMessage" ||
      !item.id ||
      (item.turn_id && item.turn_id !== live.turn_id)
    )
      return [];
    const source = item.data?.questions;
    if (!Array.isArray(source)) return [];
    const questions = source.flatMap((q, index) => {
      const id = JSON.stringify(["request_user_input_async", item.id, index]);
      if (answered.has(id) || typeof q?.title !== "string" || !q.title.trim())
        return [];
      return [
        {
          id,
          question: q.title,
          options: (Array.isArray(q.options) ? q.options : [])
            .filter((label) => typeof label === "string")
            .map((label) => ({ label })),
        },
      ];
    });
    return questions.length
      ? [
          {
            id: JSON.stringify(["request_user_input_async", item.id]),
            method: "agentMessage/questions",
            params: { turn_id: live.turn_id, questions },
          },
        ]
      : [];
  });
}

export function asyncQuestionReply(questions, answers) {
  return (
    open +
    "\n" +
    JSON.stringify(
      questions.map((q) => ({
        questionItemId: q.id,
        question: q.question,
        answer: answers[q.id],
      })),
    ) +
    "\n" +
    close
  );
}
