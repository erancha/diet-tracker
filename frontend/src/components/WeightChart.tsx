import { CartesianGrid, DefaultZIndexes, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer,
         Tooltip, XAxis, YAxis } from "recharts";
import type { ChartSpan, WeightEntry } from "../types";
import { ddmmLabel } from "../dates";
import { CHART_SPANS, chartDomain, kgLabel, risingEdges } from "../weight";

const Y_AXIS_WIDTH = 44;

function WeightTooltip({ active, payload }: { active?: boolean; payload?: { payload: WeightEntry }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return <div className="trend-tooltip">{ddmmLabel(point.date)} · {kgLabel(point.kg)} ק״ג</div>;
}

function SpanPicker({ spans, value, onChange }: {
  spans: ChartSpan[]; value: ChartSpan; onChange: (value: ChartSpan) => void;
}) {
  if (spans.length < 2) return null;
  return (
    <div className="range-picker">
      טווח:
      {spans.map((months) => (
        <label key={String(months)}>
          <input type="radio" name="weight-range" checked={value === months}
                 onChange={() => onChange(months)} />
          {" "}{CHART_SPANS.find((span) => span.months === months)!.label}
        </label>
      ))}
    </div>
  );
}

// The weight series over the chosen span, with the target as a reference line: the distance to it
// is what the chart exists to show, so the y-axis holds the target on screen even when no recorded
// weight comes near it. Every stretch the weight climbed over stands on the breach ground the
// history table and the trend panels use for a crossing, so a gain reads as a setback at a glance.
export function WeightChart({ entries, target, span, spans, onSpanChange }: {
  // Already narrowed to the active span — the section resolves it once so the chart and the
  // entries list below it can never disagree about what is on screen.
  entries: WeightEntry[];
  target: number | null;
  span: ChartSpan;
  spans: ChartSpan[];
  onSpanChange: (span: ChartSpan) => void;
}) {
  return (
    <>
      <SpanPicker spans={spans} value={span} onChange={onSpanChange} />
      <div className="trend" dir="ltr">
        <div className="trend-panel">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={entries} margin={{ top: 6, right: 14, bottom: 0, left: 0 }}>
              {/* In the gridline layer, before the gridlines, so the grounds tint the panel
                  without covering any mark drawn on it. */}
              {risingEdges(entries).map((edge) => (
                <ReferenceArea key={edge.from} x1={edge.from} x2={edge.to}
                               zIndex={DefaultZIndexes.grid} ifOverflow="hidden" fillOpacity={1}
                               fill="var(--breach-ground)" />
              ))}
              <CartesianGrid horizontal vertical={false} stroke="var(--viz-grid)" />
              {/* Keyed by the date, which is unique where a day-month label over a long span
                  need not be, so a ground's ends land on the weighings they name. */}
              <XAxis dataKey="date" scale="point" tickLine={false} tickFormatter={ddmmLabel}
                     axisLine={{ stroke: "var(--viz-baseline)" }}
                     tick={{ fontSize: 11, fill: "var(--viz-muted)" }} />
              <YAxis domain={chartDomain(entries, target)} width={Y_AXIS_WIDTH} tickLine={false}
                     axisLine={false} tickFormatter={kgLabel}
                     tick={{ fontSize: 11, fill: "var(--viz-muted)" }} />
              <Tooltip content={<WeightTooltip />} />
              {target !== null && (
                <ReferenceLine y={target} stroke="var(--viz-series-2)" strokeDasharray="5 4" />
              )}
              <Line dataKey="kg" stroke="var(--viz-series-1)" strokeWidth={2}
                    isAnimationActive={false} dot={{ r: 3, fill: "var(--viz-series-1)" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
