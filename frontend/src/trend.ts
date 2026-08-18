// Y-axis tick selection and labeling for the trend panels.

import type { Question } from "./types";

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

// Two or three gridlines at the question's min, max, and nearest-to-midpoint choice values —
// picking real choice values (rather than the padded domain edges) is what lets shortForm above
// recognize and relabel the open-ended extremes.
export function ticksFor(question: Question): { value: number; label: string }[] {
  const values = [...new Set(question.choices.map((c) => c.value!))].sort((a, b) => a - b);
  const min = values[0];
  const max = values[values.length - 1];
  const midTarget = (min + max) / 2;
  const mid = values.reduce((closest, v) => Math.abs(v - midTarget) < Math.abs(closest - midTarget) ? v : closest, min);
  return [...new Set([min, mid, max])].map((value) => ({ value, label: tickLabel(question, value) }));
}
