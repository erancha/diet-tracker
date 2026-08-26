// Y-axis gridline and bound selection for the trend panels, plus the in-progress day's
// stand-in point.

import type { Day, DayPayload, Question } from "./types";

// Today's stand-in for the trend before the day is closed: once a meal is recorded, the running
// carb score charts on the points panel so a heavy day surfaces while it can still be corrected.
// Only the carb score is meaningful mid-day (it just sums recorded meals), so the stand-in
// carries that single answer and every other panel charts today as a gap. A submitted today is
// already a recorded day and needs no stand-in.
export function liveTrendDay(today: DayPayload, days: Day[]): Day | null {
  if (today.meals.length === 0 || days.some((d) => d.date === today.date)) return null;
  return { date: today.date, answers: { carbs: today.derived.carbs } };
}

// A choice phrased as an open-ended bound ("מעל 12 שעות", "פחות מ-2.5 ליטר") answers for
// everything past the ladder's last measured step, so its stored value is a sentinel one step
// beyond that step rather than a quantity of its own.
const OPEN_BOUND_LABEL = /^(מעל|פחות מ-?)\s*\d/;

// Points questions get fixed 0 / midpoint / max gridlines over their day-total scale. Other
// questions get two or three gridlines at the lowest, nearest-to-midpoint, and highest measured
// choice value. The open-ended bounds are left out: they mark no position on the scale, so a day
// answering one plots past the outermost gridline — inside the padding domainFor keeps for it —
// and reads as beyond that bound.
export function ticksFor(question: Question): number[] {
  if (question.type === "points") {
    const max = question.max!;
    return [0, max / 2, max];
  }
  const measured = question.choices.filter((c) => !OPEN_BOUND_LABEL.test(c.label));
  const values = [...new Set(measured.map((c) => c.value))].sort((a, b) => a - b);
  const min = values[0];
  const max = values[values.length - 1];
  const midTarget = (min + max) / 2;
  const mid = values.reduce((closest, v) => Math.abs(v - midTarget) < Math.abs(closest - midTarget) ? v : closest, min);
  return [...new Set([min, mid, max])];
}

// The panel's y-axis bounds. A points question's plotted value is a summed day total, not a
// choice value, and can run past the highest individual choice (e.g. two heavy-carbs meals) —
// its domain spans the configured max, extended further if a day total still exceeds that.
// Single-type questions plot one choice value per day, so their domain stays choice-bound.
export function domainFor(question: Question, values: (number | null)[]): [number, number] {
  if (question.type === "points") {
    const dataMax = values.reduce<number>((max, v) => (v !== null && v > max ? v : max), 0);
    return [-0.5, Math.max(question.max!, dataMax) + 0.5];
  }
  const choiceValues = question.choices.map((c) => c.value);
  return [Math.min(...choiceValues) - 0.5, Math.max(...choiceValues) + 0.5];
}
