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

// Points questions get fixed 0 / midpoint / max gridlines over their day-total scale. Other
// questions get two or three gridlines at the lowest, nearest-to-midpoint, and highest measured
// choice value. The choices the config marks as open-ended bounds are left out: they mark no
// position on the scale, so a day answering one plots past the outermost gridline — inside the
// padding domainFor keeps for it — and reads as beyond that bound.
export function ticksFor(question: Question): number[] {
  if (question.type === "points") {
    const max = question.max!;
    return [0, max / 2, max];
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

// The panel's y-axis bounds. A points question's plotted value is a summed day total, not a
// choice value, and can run past the highest individual choice (e.g. two heavy-carbs meals) —
// its domain spans the configured max, extended further if a day total still exceeds that.
//
// Other questions span their gridlines, so the outermost measured choices stay on screen as the
// reference the days are read against, extended to whatever the week actually plots past them: a
// day answering an open-ended bound, or a computed value between choices. Days keep their true
// linear spacing, and a bound nobody answered this week costs the panel no height.
export function domainFor(question: Question, values: (number | null)[]): [number, number] {
  if (question.type === "points") {
    const dataMax = values.reduce<number>((max, v) => (v !== null && v > max ? v : max), 0);
    return [-0.5, Math.max(question.max!, dataMax) + 0.5];
  }
  const ticks = ticksFor(question);
  const plotted = values.filter((v) => v !== null);
  const min = Math.min(ticks[0], ...plotted);
  const max = Math.max(ticks[ticks.length - 1], ...plotted);
  const padding = (max - min) * EDGE_PADDING;
  return [min - padding, max + padding];
}
