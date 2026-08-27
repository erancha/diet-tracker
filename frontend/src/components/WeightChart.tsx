import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartSpan, WeightEntry } from "../types";
import { ddmmLabel } from "../dates";
import { CHART_SPANS, chartDomain, kgLabel } from "../weight";

const Y_AXIS_WIDTH = 44;

interface Point {
  date: string;
  label: string;
  kg: number;
}

function WeightTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
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
// weight comes near it.
export function WeightChart({ entries, target, span, spans, onSpanChange }: {
  // Already narrowed to the active span — the section resolves it once so the chart and the
  // entries list below it can never disagree about what is on screen.
  entries: WeightEntry[];
  target: number | null;
  span: ChartSpan;
  spans: ChartSpan[];
  onSpanChange: (span: ChartSpan) => void;
}) {
  const data: Point[] = entries.map((entry) => ({ ...entry, label: ddmmLabel(entry.date) }));

  return (
    <>
      <SpanPicker spans={spans} value={span} onChange={onSpanChange} />
      <div className="trend" dir="ltr">
        <div className="trend-panel">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data} margin={{ top: 6, right: 14, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal vertical={false} stroke="var(--viz-grid)" />
              <XAxis dataKey="label" scale="point" tickLine={false}
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
