// Threshold-rule checks and numeric-value labeling against the questionnaire config. All
// functions take the questionnaire explicitly so they stay pure and independently testable.

import type { Question, Questionnaire, Rule } from "./types";

export function violates(rule: Rule, value: number): boolean {
  return rule.at_least !== undefined ? value >= rule.at_least : value < rule.below!;
}

export function isViolating(questionnaire: Questionnaire, questionId: string, value: number): boolean {
  return questionnaire.rules.some((rule) => rule.question_id === questionId && violates(rule, value));
}

// The choice label for an exactly-matching value, else the number itself — stored values
// between choice anchors (e.g. a computed 10.4h window) are legal. A points question stores a
// summed score, not a picked choice, so its value is always shown as the number: a score of 3
// happening to equal grade3's per-meal weight does not mean grade3 was eaten.
export function valueLabel(question: Question, value: number): string {
  if (question.type === "points") return String(value);
  return question.choices.find((c) => c.value === value)?.label ?? String(value);
}

// Questions with a panel_title chart as trend panels; the rest surface in the violations strip.
export function trendPanels(questionnaire: Questionnaire): { panels: Question[]; strip: Question[] } {
  const panels = questionnaire.questions.filter((q) => q.panel_title !== undefined);
  return { panels, strip: questionnaire.questions.filter((q) => !panels.includes(q)) };
}
