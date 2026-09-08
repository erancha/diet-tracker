// Y-axis gridline and bound selection for the trend panels, the in-progress day's stand-in
// point, and the treat day's column.

import { carbsScales, excludedPoints } from "./derive";
import { parseIsoDate, weekdayIndexOf } from "./dates";
import type { Day, DayPayload, Question, Questionnaire } from "./types";
import { questionRule } from "./violations";

// Today's stand-in for the trend before the day is closed: once a meal is recorded, the running
// carb score charts on the points panel so a heavy day surfaces while it can still be corrected.
// Only the carb score is meaningful mid-day (it just sums recorded meals), so the stand-in
// carries that single answer and every other panel charts today as a gap. Its excluded part is
// derived here from the same meals, the server sending it only for the days it has stored. A
// submitted today is already a recorded day and needs no stand-in.
export function liveTrendDay(questionnaire: Questionnaire, today: DayPayload, days: Day[]): Day | null {
  if (today.meals.length === 0 || days.some((d) => d.date === today.date)) return null;
  const carbs = questionnaire.questions.find((q) => q.id === "carbs")!;
  const scales = carbsScales(carbs);
  return {
    date: today.date,
    answers: { carbs: today.derived.carbs },
    excluded: excludedPoints(today.meals, scales.weights, scales.additionValues, scales.amounts,
                             scales.portions, scales.secondSource, scales.excluded),
  };
}

// Which of the charted columns fall on the treat day's weekday. The charted span is longer than
// a week, so it holds the weekday once or twice, and every match is framed: the second is what
// lets the two treat days be compared. A span that holds none is a caller fault, not a day the
// chart may quietly leave unframed.
export function treatDayColumns(dayStrs: string[], weekday: string): number[] {
  const target = weekdayIndexOf(weekday);
  const columns = dayStrs.flatMap((d, i) => (parseIsoDate(d).getDay() === target ? [i] : []));
  if (columns.length === 0) throw new Error(`no ${weekday} among the charted days ${dayStrs.join(", ")}`);
  return columns;
}

// A points panel grids at its rule's heavy-day limit and the two multiples above it, so each
// gridline a day crosses reads as another limit's worth of score; parse() in
// src/common/questionnaire.py guarantees an at_least/above rule exists. Other questions get two or
// three gridlines at the lowest, nearest-to-midpoint, and highest measured choice value. The
// choices the config marks as open-ended bounds are left out: they mark no position on the
// scale, so a day answering one plots past the outermost gridline — inside the padding domainFor
// keeps for it — and reads as beyond that bound.
export function ticksFor(questionnaire: Questionnaire, question: Question): number[] {
  if (question.type === "points") {
    const rule = questionRule(questionnaire, question.id)!;
    const limit = (rule.at_least ?? rule.above)!;
    return [limit, limit * 2, limit * 3];
  }
  const measured = question.choices.filter((c) => c.bound !== true);
  const values = [...new Set(measured.map((c) => c.value))].sort((a, b) => a - b);
  const min = values[0];
  const max = values[values.length - 1];
  const midTarget = (min + max) / 2;
  const mid = values.reduce((closest, v) => Math.abs(v - midTarget) < Math.abs(closest - midTarget) ? v : closest, min);
  return [...new Set([min, mid, max])];
}

// Breathing room past each end of the plotted span, as a fraction of it, so a dot sitting on the
// outermost gridline or on the extreme day still draws clear of the panel edge.
const EDGE_PADDING = 0.08;

// The panel's y-axis bounds. A points question's plotted value is a summed day total starting
// at 0 — its domain spans the top gridline, three heavy-day limits up, extended further if a
// day total still exceeds that.
//
// Other questions span their gridlines, so the outermost measured choices stay on screen as the
// reference the days are read against, extended to whatever the week actually plots past them: a
// day answering an open-ended bound, or a computed value between choices. Days keep their true
// linear spacing, and a bound nobody answered this week costs the panel no height.
export function domainFor(questionnaire: Questionnaire, question: Question,
                          values: (number | null)[]): [number, number] {
  const ticks = ticksFor(questionnaire, question);
  if (question.type === "points") {
    const dataMax = values.reduce<number>((max, v) => (v !== null && v > max ? v : max), 0);
    return [-0.5, Math.max(ticks[ticks.length - 1], dataMax) + 0.5];
  }
  const plotted = values.filter((v) => v !== null);
  const min = Math.min(ticks[0], ...plotted);
  const max = Math.max(ticks[ticks.length - 1], ...plotted);
  const padding = (max - min) * EDGE_PADDING;
  return [min - padding, max + padding];
}
