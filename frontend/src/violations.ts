// Threshold-rule checks, violating-streak evaluation, and numeric-value labeling against the
// questionnaire config. All functions take the questionnaire explicitly so they stay pure and
// independently testable.

import type { Day, Question, Questionnaire, Rule } from "./types";
import { isoDate, parseIsoDate, yesterdayOf } from "./dates";

export function violates(rule: Rule, value: number): boolean {
  return rule.at_least !== undefined ? value >= rule.at_least : value < rule.below!;
}

// Formatted messages of the rules whose violating streak is still running — the client-side
// mirror of the backend's streak walk (src/common/rules.py), reading the same rules the chart's
// red dots use, so the alarm and the chart always agree. A streak is
// counted over consecutive calendar days ending at the newest submitted day; a gap day or a day
// predating the rule's question ends it. A newest day older than yesterday is stale, not a
// reminder: the streak may have already been broken by the unsubmitted days, so nothing reports.
export function activeViolations(questionnaire: Questionnaire, days: Day[],
                                 todayStr: string, yesterdayStr: string): string[] {
  const newest = days[0];
  if (newest === undefined || (newest.date !== todayStr && newest.date !== yesterdayStr)) return [];
  const answersByDate = new Map(days.map((d) => [d.date, d.answers]));
  return questionnaire.rules.flatMap((rule) => {
    let day = parseIsoDate(newest.date);
    let streak = 0;
    for (;;) {
      const value = answersByDate.get(isoDate(day))?.[rule.question_id];
      if (value === undefined || !violates(rule, value)) break;
      streak += 1;
      day = yesterdayOf(day);
    }
    if (streak < rule.consecutive_days) return [];
    const threshold = rule.at_least ?? rule.below!;
    return [rule.message.replaceAll("{days}", String(streak)).replaceAll("{value}", String(threshold))];
  });
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

// The choice label for an exactly-matching value, for the places that show a value on its own —
// a radio option, a chart tooltip — where nothing else names the unit. Stored values between
// choice anchors, or past them, are legal, since the meal log derives them, and carry the unit
// themselves. A points question stores a summed score, not a picked choice, so its value is
// always shown as the number: a score of 3 happening to equal grade3's per-meal weight does not
// mean grade3 was eaten.
export function valueLabel(question: Question, value: number): string {
  if (question.type === "points") return String(value);
  const choice = question.choices.find((c) => c.value === value);
  if (choice !== undefined) return choice.label;
  return question.unit === undefined ? String(value) : `${value} ${question.unit}`;
}

// The same value under a heading that already names the unit: the number alone, so a column of
// them reads as a column of quantities rather than repeating the unit down every row. A choice
// phrased as an open-ended bound is not a quantity — its wording is the only thing that says what
// it means — so it keeps its label whatever the heading says.
export function headedValue(question: Question, value: number): string {
  if (question.type === "points") return String(value);
  const choice = question.choices.find((c) => c.value === value);
  return choice?.bound === true ? choice.label : String(value);
}

// A question's heading for one scope. The config stores the base text once; a scope that shifts
// its meaning (a day heading shows a summed score, a tracker meal a single grade, a trend panel
// a charted score) declares a qualifier, appended here in parentheses. A day heading with no
// qualifier of its own names the unit instead, which is what lets the values beneath it drop it.
// The same day-scope composition exists server-side as Question.day_title for digest emails.
export function questionTitle(question: Question, scope: "day" | "meal" | "panel"): string {
  const qualifier = scope === "day" ? question.day_qualifier ?? question.unit
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
