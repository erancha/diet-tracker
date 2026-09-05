// Threshold-rule checks, violating-streak evaluation, and numeric-value labeling against the
// questionnaire config. All functions take the questionnaire explicitly so they stay pure and
// independently testable.

import type { AnswerValue, Choice, Day, Question, Questionnaire, Rule } from "./types";
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

// Whether any answer of one submitted day crosses its rule's bound on its own — the same per-day
// signal the history table paints red. The submit banner reads it so a saved day is declared
// clean only when nothing crossed a bound; a crossing short of its consecutive-days run is named
// as such instead of masquerading as a clean day.
export function crossesThreshold(questionnaire: Questionnaire,
                                 answers: Record<string, AnswerValue>): boolean {
  return Object.entries(answers).some(([questionId, value]) =>
    isViolating(questionnaire, questionId, value));
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
