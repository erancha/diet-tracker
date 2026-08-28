// Pure weight-log logic: the chart's span selection and y-axis bounds, the reading the summary
// line renders, the wording of the confirmations the section raises, and what a typed weight has
// to satisfy to count. The components hold no arithmetic of their own.

import { ddmmLabel, parseIsoDate } from "./dates";
import type { ChartSpan, WeightEntry } from "./types";

// The spans the range selector offers, in the order it lays them out. Mirrors CHART_SPANS in
// src/common/appconfig.py, which rejects a configured opening span naming none of them.
export const CHART_SPANS: { months: ChartSpan; label: string }[] = [
  { months: 1, label: "חודש" },
  { months: 3, label: "3 חודשים" },
  { months: 6, label: "חצי שנה" },
  { months: 12, label: "שנה" },
  { months: null, label: "הכל" },
];

// The entries a span covers, counted back in calendar months from today. A null span is הכל and
// returns the series whole.
export function entriesWithin(entries: WeightEntry[], months: ChartSpan, today: Date): WeightEntry[] {
  if (months === null) return entries;
  const from = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
  return entries.filter((entry) => parseIsoDate(entry.date) >= from);
}

// The spans worth offering for a series: one is kept only where it reaches past every span
// already offered, so a chip that would redraw the same points — a year's chip on a fortnight of
// weighings — never appears, and neither does one reaching no point at all. Mirrors how the
// history table narrows its own range picker. Widest last, which activeSpan relies on.
export function offeredSpans(entries: WeightEntry[], today: Date): ChartSpan[] {
  const offered: ChartSpan[] = [];
  let widest = 0;
  for (const { months } of CHART_SPANS) {
    const reach = entriesWithin(entries, months, today).length;
    if (reach > widest) {
      offered.push(months);
      widest = reach;
    }
  }
  return offered;
}

// The span the chart plots: the reader's choice while the series still offers it, else the widest
// span that survives — which covers the series whole, so the fallback can never leave the chart
// blank. Both a delete shrinking the series and an opening span older than every recorded weight
// land here.
export function activeSpan(offered: ChartSpan[], chosen: ChartSpan): ChartSpan {
  if (offered.includes(chosen)) return chosen;
  return offered.length === 0 ? null : offered[offered.length - 1];
}

// Breathing room past each end of the plotted span, as a fraction of it — the same allowance the
// trend panels keep, so a point sitting on the target line still draws clear of the chart edge.
const EDGE_PADDING = 0.08;

// Kilograms of headroom given to a chart whose points all sit at one weight, where the span the
// padding would scale is zero.
const FLAT_SERIES_PADDING = 1;

// The chart's y-axis bounds, spanning the plotted weights and the target they are read against —
// a target off the plotted range still has to be on screen for the distance to it to mean
// anything. At least one weight is always plotted: the chart is drawn only for a recorded series,
// and activeSpan resolves to a span that covers it.
export function chartDomain(entries: WeightEntry[], target: number | null): [number, number] {
  const values = entries.map((entry) => entry.kg);
  if (target !== null) values.push(target);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = max === min ? FLAT_SERIES_PADDING : (max - min) * EDGE_PADDING;
  return [min - padding, max + padding];
}

// One decimal is the finest a bathroom scale reports, and a whole number should not read as
// "76.0" — so the fraction shows only when there is one.
export function kgLabel(kg: number): string {
  return `${Number(kg.toFixed(1))}`;
}

// Half a tenth of a kilogram: below it the gap and the target render as the same one-decimal
// number, so the line reads as arrival rather than as a distance it cannot show.
const AT_TARGET_KG = 0.05;

/**
 * The section's one-line reading, which is also where the target is set. It comes apart rather
 * than arriving pre-rendered because the line has to paint its figures, leave the units as
 * chrome, and hand the word יעד to a control.
 */
export interface WeightSummary {
  // The latest recorded weight, or null before anything has been weighed.
  latest: number | null;
  target: number | null;
  // Distance to the target when there is one worth stating, else null.
  gapKg: number | null;
  // What immediately precedes the word יעד. The prefix letter belongs to the phrasing rather than
  // to the control, so the word itself stays one clickable token across all four readings.
  prefix: string;
  // The latest weight stands above the target by enough for the line to state the distance — the
  // one reading the section paints as a miss rather than as progress.
  overTarget: boolean;
}

export function summarize(entries: WeightEntry[], target: number | null): WeightSummary {
  const latest = entries.length === 0 ? null : entries[entries.length - 1].kg;
  if (latest === null || target === null) {
    return { latest, target, gapKg: null, prefix: "ה", overTarget: false };
  }
  const gap = latest - target;
  if (Math.abs(gap) < AT_TARGET_KG) {
    return { latest, target, gapKg: null, prefix: "ב", overTarget: false };
  }
  return {
    latest, target,
    gapKg: Math.abs(gap),
    prefix: gap > 0 ? "מעל ה" : "מתחת ל",
    overTarget: gap > 0,
  };
}

// Wording of the confirmations and notices the weight log raises, kept here so each reads the same
// wherever it is raised and can be asserted without reaching into a component.
export function targetChangePrompt(kg: number, current: number | null): string {
  const verb = current === null ? "לקבוע" : "לעדכן";
  return `${verb} את משקל היעד ל-${kgLabel(kg)} ק״ג?`;
}

// Raised when a weighing is recorded against no target: without one the chart draws no reference
// line and the section's own line has no distance to state.
export const TARGET_UNSET_NOTICE = "משקל היעד טרם נקבע — קבעו יעד כדי לעקוב אחר המרחק ממנו";

export function deleteWeightPrompt(entry: WeightEntry): string {
  return `למחוק את השקילה של ${ddmmLabel(entry.date)} (${kgLabel(entry.kg)} ק״ג)?`;
}

/** The weight a filled input holds, or null when it is empty or outside what the API accepts. */
export function parseKg(text: string, limits: { min_kg: number; max_kg: number }): number | null {
  const kg = Number(text);
  if (text.trim() === "" || !Number.isFinite(kg)) return null;
  return kg >= limits.min_kg && kg <= limits.max_kg ? kg : null;
}
