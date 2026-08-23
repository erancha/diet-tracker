// Threshold-rule checks and numeric-value labeling against the questionnaire config. All
// functions take the questionnaire explicitly so they stay pure and independently testable.

import type { Question, Questionnaire, Rule } from "./types";

export function violates(rule: Rule, value: number): boolean {
  return rule.at_least !== undefined ? value >= rule.at_least : value < rule.below!;
}

export function isViolating(questionnaire: Questionnaire, questionId: string, value: number): boolean {
  return questionnaire.rules.some((rule) => rule.question_id === questionId && violates(rule, value));
}

// Carb-score emphasis thresholds: a day total above this fraction of the points question's max,
// or a single meal grade above this value, renders emphasized in red.
export const HIGH_SCORE_FRACTION = 0.3;
export const HIGH_GRADE_THRESHOLD = 3;

export function isHighScore(question: Question, value: number): boolean {
  return question.max !== undefined && value > question.max * HIGH_SCORE_FRACTION;
}

// The choice label for an exactly-matching value, else the number itself — stored values
// between choice anchors (e.g. a computed 10.4h window) are legal. A points question stores a
// summed score, not a picked choice, so its value is always shown as the number: a score of 3
// happening to equal grade3's per-meal weight does not mean grade3 was eaten.
export function valueLabel(question: Question, value: number): string {
  if (question.type === "points") return String(value);
  return question.choices.find((c) => c.value === value)?.label ?? String(value);
}

// A question's heading for one scope. The config stores the base text once; a scope that shifts
// its meaning (a day heading shows a summed score, a tracker meal a single grade, a trend panel
// a charted score) declares a qualifier, appended here in parentheses. The same day-scope
// composition exists server-side as Question.day_title for digest emails.
export function questionTitle(question: Question, scope: "day" | "meal" | "panel"): string {
  const qualifier = scope === "day" ? question.day_qualifier
    : scope === "meal" ? question.meal_qualifier
    : question.panel_qualifier;
  return qualifier === undefined ? question.text : `${question.text} (${qualifier})`;
}

// A question's trend-panel heading, or undefined for questions charting no panel: panel_title
// stands alone when the chart names the subject differently from the question text; otherwise
// panel_qualifier qualifies the text, keeping the subject defined once in the config.
export function panelTitle(question: Question): string | undefined {
  if (question.panel_title !== undefined) return question.panel_title;
  return question.panel_qualifier !== undefined ? questionTitle(question, "panel") : undefined;
}

// Questions with a panel heading chart as trend panels; the rest surface in the violations
// strip. Points panels chart before single-type panels — the summed carb score is the day's
// headline metric — with config order kept within each group.
export function trendPanels(questionnaire: Questionnaire): { panels: Question[]; strip: Question[] } {
  const panels = questionnaire.questions.filter((q) => panelTitle(q) !== undefined)
    .sort((a, b) => Number(b.type === "points") - Number(a.type === "points"));
  return { panels, strip: questionnaire.questions.filter((q) => !panels.includes(q)) };
}
