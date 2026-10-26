export function questionFormAnswers(questions, form) {
  const answers = Object.create(null);
  for (const question of questions) {
    let value;
    if (question.multiSelect) {
      const selected = form.getAll(question.id).map(String).filter(Boolean);
      const other = String(form.get(question.id + "-text") || "").trim();
      value = [...new Set([...selected, ...(other ? [other] : [])])];
    } else {
      value = String(
        form.get(question.id + "-text") || form.get(question.id) || "",
      ).trim();
    }
    if (!value.length) throw new Error("Answer every question.");
    answers[question.id] = value;
  }
  return answers;
}
