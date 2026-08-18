// Rule-violation checks and label resolution against the questionnaire config. All functions
// take the questionnaire explicitly so they stay pure and independently testable.

import type { AnswerValue, Question, Questionnaire } from "./types";

export function selectedIds(value: AnswerValue): string[] {
  return Array.isArray(value) ? value : [value];
}

export function choiceLabel(questionnaire: Questionnaire, questionId: string, choiceId: string): string {
  const question = questionnaire.questions.find((q) => q.id === questionId)!;
  // Historical answers may reference choices from older questionnaire versions.
  return question.choices.find((c) => c.id === choiceId)?.label ?? choiceId;
}

export function isViolating(questionnaire: Questionnaire, questionId: string, value: AnswerValue): boolean {
  return questionnaire.rules.some((rule) =>
    rule.question_id === questionId && selectedIds(value).some((id) => rule.violating_choice_ids.includes(id)));
}

// Labels of just the violating choices selected for a question (there is at most one violating
// rule per question in the current config, but a multi-select question could match more than one).
export function violatingChoiceLabels(questionnaire: Questionnaire, questionId: string, value: AnswerValue): string {
  const violatingIds = questionnaire.rules
    .filter((rule) => rule.question_id === questionId)
    .flatMap((rule) => [...rule.violating_choice_ids]);
  return selectedIds(value)
    .filter((id) => violatingIds.includes(id))
    .map((id) => choiceLabel(questionnaire, questionId, id))
    .join(" · ");
}

// Chartable = every choice carries a numeric "value" (config-driven unit mapping, e.g. liters,
// hours) — questions without a full numeric mapping are surfaced only in the violations strip.
export function splitChartable(questionnaire: Questionnaire): { chartable: Question[]; other: Question[] } {
  const chartable = questionnaire.questions.filter((q) => q.choices.every((c) => typeof c.value === "number"));
  return { chartable, other: questionnaire.questions.filter((q) => !chartable.includes(q)) };
}
