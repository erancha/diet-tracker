// Threshold-rule checks, crossing wording, and value and heading labels, all read off the
// questionnaire config passed in rather than any shared state.

import type { Choice, Question, Questionnaire, Rule } from "./types";

export function violates(rule: Rule, value: number): boolean {
  if (rule.at_least !== undefined) return value >= rule.at_least;
  if (rule.above !== undefined) return value > rule.above;
  return value < rule.below!;
}

// The rule bounding a question, or undefined where none does and nothing ever marks red.
export function questionRule(questionnaire: Questionnaire, questionId: string): Rule | undefined {
  return questionnaire.rules.find((r) => r.question_id === questionId);
}

// Where a question's rule splits the scale, and which side of that value it counts as a
// violation. The bound is the value the rule names, whether it is crossed by reaching it, by
// exceeding it, or by falling under it.
export interface RuleBand {
  bound: number;
  violatingAbove: boolean;
}

// The split a question's rule draws on its scale, or undefined where no rule bounds it and
// nothing ever marks red. Read from the live rules so what a surface paints can never drift
// from what isViolating decides.
export function ruleBand(questionnaire: Questionnaire, questionId: string): RuleBand | undefined {
  const rule = questionRule(questionnaire, questionId);
  return rule === undefined ? undefined : band(rule);
}

function band(rule: Rule): RuleBand {
  const over = rule.at_least ?? rule.above;
  return over !== undefined ? { bound: over, violatingAbove: true }
                            : { bound: rule.below!, violatingAbove: false };
}

// The configured bound of a question's rule, phrased for display beside the red violation
// marks; undefined where no rule bounds the question.
export function ruleBoundLabel(questionnaire: Questionnaire, questionId: string): string | undefined {
  const band = ruleBand(questionnaire, questionId);
  if (band === undefined) return undefined;
  return band.violatingAbove ? `מעל ${band.bound}` : `פחות מ-${band.bound}`;
}

// Every day is judged alike, the treat day included, mirroring violating_days in
// src/common/rules.py; a treat-day crossing is softened only in how the surfaces paint it.
export function isViolating(questionnaire: Questionnaire, questionId: string, value: number): boolean {
  return questionnaire.rules.some((rule) => rule.question_id === questionId && violates(rule, value));
}

// How yesterday is named wherever a crossing sentence mentions it. The sign-in banner turns this
// same word into the link opening yesterday's day view, so the word it links cannot drift from the
// word the sentence was built from.
export const YESTERDAY_WORD = "אתמול";

// How the days a crossing was found on are named. A day is the subject of its own sentence, so the
// pair takes the plural verb.
const CROSSED = {
  yesterday: `${YESTERDAY_WORD} חצה סף`,
  today: "היום חצה סף",
  both: `${YESTERDAY_WORD} והיום חצו סף`,
};

export type CrossedDays = keyof typeof CROSSED;

// Where a crossing is already on show, closing every sentence that reports one. No color is
// named: the surfaces paint a treat-day crossing amber and any other red.
const CROSSING_MARKED = "(מסומן בצבע אחר במגמות)";

// The sentence a surface reports a crossing in, so no two of them word it differently or point at
// a different place than the others.
export function crossingNotice(days: CrossedDays): string {
  return `${CROSSED[days]} ${CROSSING_MARKED}`;
}

// Whether a day's score crosses its rule's bound, judged on whatever figures the day has: a
// closed day's answers, or the figures an open day's meals so far derive. The two are judged
// alike because a score's bound is one the day grows into, so a running score that has reached
// it still stands there at closing.
export function crossesScoreBound(questionnaire: Questionnaire,
                                  values: Record<string, number>): boolean {
  const scores = new Set(
    questionnaire.questions.filter((q) => q.type === "points").map((q) => q.id));
  return questionnaire.rules.some((rule) =>
    scores.has(rule.question_id) && violates(rule, values[rule.question_id]));
}

// What one plate must cost to count as heavy, judged on the meal's whole price — its grade,
// second source, escalated fruit and additions — since a light grade beside a drink outprices a
// steep grade eaten small. The day-scope counterpart is the question's rule, read through
// isViolating. A points question always declares the bound: parse() in
// src/common/questionnaire.py rejects a config where one does not.
export function isHeavyMeal(question: Question, points: number): boolean {
  return points >= question.heavy_meal!;
}

// A day's score wherever it shows as the day's mark. Whole: the fractional points a reduced
// helping derives are real to the rules and to what the server stores, but a mark of 29.5 reads
// as a precision the grades never claim.
export function scoreLabel(value: number): string {
  return String(Math.round(value));
}

// The choice label for an exactly-matching value, for the places that show a value on its own —
// a radio option, a chart tooltip — where nothing else names the unit. Stored values between
// choice anchors, or past them, are legal, since the meal log derives them, and carry the unit
// themselves. A points question stores a summed score, not a picked choice, so its value is
// always shown as the rounded score: a score of 3 happening to equal grade3's per-meal weight
// does not mean grade3 was eaten.
export function valueLabel(question: Question, value: number): string {
  if (question.type === "points") return scoreLabel(value);
  const choice = question.choices.find((c) => c.value === value);
  if (choice !== undefined) return choice.label;
  return question.unit === undefined ? String(value) : `${value} ${question.unit}`;
}

// The bound choice a value answers, or undefined where the value is a plain quantity — a points
// score, a measured amount, or a non-bound choice.
function boundChoice(question: Question, value: number): Choice | undefined {
  if (question.type === "points") return undefined;
  const choice = question.choices.find((c) => c.value === value);
  return choice?.bound === true ? choice : undefined;
}

// Whether a value's display is a bound label rather than a number — the sentence-length texts a
// layout may treat differently from single-word quantities.
export function isBoundValue(question: Question, value: number): boolean {
  return boundChoice(question, value) !== undefined;
}

// The same value under a heading that already names the unit: the number alone, so a column of
// them reads as a column of quantities rather than repeating the unit down every row. A choice
// phrased as an open-ended bound is not a quantity — its wording is the only thing that says what
// it means — so it keeps its label whatever the heading says. A points score is the day's mark
// and reads as the whole number scoreLabel makes of it.
export function headedValue(question: Question, value: number): string {
  if (question.type === "points") return scoreLabel(value);
  return boundChoice(question, value)?.label ?? String(value);
}

// A question's heading for one scope. The config stores the base text once; a scope that shifts
// its meaning (a day heading shows a summed score, a tracker meal a single grade, a trend panel
// a charted score) declares a qualifier, appended here in parentheses. A day heading with no
// qualifier of its own names the unit instead, which is what lets the values beneath it drop it.
// A standalone day_title replaces the composition, as panel_title does for panelTitle. The same
// day-scope heading exists server-side as Question.day_heading for digest emails and the chat.
export function questionTitle(question: Question, scope: "day" | "meal" | "panel"): string {
  if (scope === "day" && question.day_title !== undefined) return question.day_title;
  const qualifier = scope === "day" ? question.day_qualifier ?? question.unit
    : scope === "meal" ? question.meal_qualifier
    : question.panel_qualifier;
  return qualifier === undefined ? question.text : `${question.text} (${qualifier})`;
}

// The part of a carb score the program excludes on its six non-treat days, named the same wherever
// it is reported — the trend panel's second line and the history table's column.
export const EXCLUDED_LABEL = "קמחים וסוכרים";

// The same subtotal where it is tabulated as a figure rather than named as a chart line: the
// history column sits beside the day's own score, and says which of the two it reports.
export const EXCLUDED_SCORE_LABEL = `ציון ${EXCLUDED_LABEL}`;

// A question's trend-panel heading, or undefined for questions charting no panel: panel_title
// stands alone when the chart names the subject differently from the question text; otherwise
// panel_qualifier qualifies the text, keeping the subject defined once in the config.
export function panelTitle(question: Question): string | undefined {
  if (question.panel_title !== undefined) return question.panel_title;
  return question.panel_qualifier !== undefined ? questionTitle(question, "panel") : undefined;
}

// Questions with a panel heading chart as trend panels; the rest trend nowhere — their rule
// crossings surface in the history table alone. Points panels chart before single-type panels —
// the summed carb score is the day's headline metric — with config order kept within each group.
export function trendPanels(questionnaire: Questionnaire): Question[] {
  return questionnaire.questions.filter((q) => panelTitle(q) !== undefined)
    .sort((a, b) => Number(b.type === "points") - Number(a.type === "points"));
}
