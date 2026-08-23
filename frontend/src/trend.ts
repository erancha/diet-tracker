// Y-axis tick selection and labeling for the trend panels, plus the in-progress day's
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

// Short form for choice labels phrased as an open-ended bound ("מעל 12 שעות", "פחות מ-2.5 ליטר")
// so a y-axis tick landing on that choice reads the bound instead of the bare mapped number.
export function shortForm(label: string): string | null {
  const m = label.match(/^(מעל|פחות מ-?)\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return m[1].endsWith("-") ? `${m[1]}${m[2]}` : `${m[1]} ${m[2]}`;
}

function tickLabel(question: Question, value: number): string {
  const choice = question.choices.find((c) => c.value === value);
  return (choice && shortForm(choice.label)) || String(value);
}

// Points questions get fixed 0 / midpoint / max gridlines over their day-total scale. Other
// questions get two or three gridlines at the question's min, max, and nearest-to-midpoint
// choice values — picking real choice values (rather than the padded domain edges) is what lets
// shortForm above recognize and relabel the open-ended extremes.
export function ticksFor(question: Question): { value: number; label: string }[] {
  if (question.type === "points") {
    const max = question.max!;
    return [0, max / 2, max].map((value) => ({ value, label: String(value) }));
  }
  const values = [...new Set(question.choices.map((c) => c.value))].sort((a, b) => a - b);
  const min = values[0];
  const max = values[values.length - 1];
  const midTarget = (min + max) / 2;
  const mid = values.reduce((closest, v) => Math.abs(v - midTarget) < Math.abs(closest - midTarget) ? v : closest, min);
  return [...new Set([min, mid, max])].map((value) => ({ value, label: tickLabel(question, value) }));
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
