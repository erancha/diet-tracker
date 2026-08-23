import { CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Day, Question, Questionnaire } from "../types";
import { dayLabel, last7Days } from "../dates";
import { domainFor, ticksFor } from "../trend";
import { isViolating, panelTitle, questionTitle, trendPanels, valueLabel } from "../violations";

// Shared horizontal geometry across the panels and the violations strip: the panels reserve the
// y-axis width axis-side, the strip (which has no y-axis) reserves it as left margin, so every
// chart plots the 7 day columns at identical x positions.
const Y_AXIS_WIDTH = 78;
const MARGIN_RIGHT = 14;

interface PanelPoint {
  date: string;
  label: string;
  // null charts as a gap: the day is missing or predates the question.
  value: number | null;
  choiceLabel: string | null;
  violating: boolean;
}

interface StripPoint {
  label: string;
  y: number;
  violations: string[];
}

function panelData(questionnaire: Questionnaire, question: Question, dayStrs: string[], dayByDate: Map<string, Day>): PanelPoint[] {
  return dayStrs.map((date) => {
    const gap: PanelPoint = { date, label: dayLabel(date), value: null, choiceLabel: null, violating: false };
    const day = dayByDate.get(date);
    if (!day || !(question.id in day.answers)) return gap;
    const value = day.answers[question.id];
    return { ...gap, value, choiceLabel: valueLabel(question, value),
             violating: isViolating(questionnaire, question.id, value) };
  });
}

function stripData(questionnaire: Questionnaire, otherQuestions: Question[], dayStrs: string[], dayByDate: Map<string, Day>): StripPoint[] {
  return dayStrs.map((date) => {
    const day = dayByDate.get(date);
    const violations = day
      ? otherQuestions
          .filter((q) => q.id in day.answers && isViolating(questionnaire, q.id, day.answers[q.id]))
          .map((q) => `${questionTitle(q, "day")}: ${valueLabel(q, day.answers[q.id])}`)
      : [];
    return { label: dayLabel(date), y: 0, violations };
  });
}

function PanelDot({ cx, cy, payload, color }: { cx?: number; cy?: number; payload?: PanelPoint; color: string }) {
  if (cx == null || cy == null || payload!.value == null) return null;
  const violating = payload!.violating;
  return <circle cx={cx} cy={cy} r={violating ? 4.5 : 4} fill={violating ? "var(--viz-critical)" : color} />;
}

function PanelTooltip({ active, payload }: { active?: boolean; payload?: { payload: PanelPoint }[] }) {
  if (!active || !payload?.length || payload[0].payload.value == null) return null;
  const point = payload[0].payload;
  return <div className="trend-tooltip">{dayLabel(point.date)} · {point.choiceLabel}</div>;
}

function StripTicks({ cx, cy, payload }: { cx?: number; cy?: number; payload?: StripPoint }) {
  if (cx == null || cy == null || payload!.violations.length === 0) return null;
  return (
    <g>
      {payload!.violations.map((_, j) => {
        const x = cx + (j - (payload!.violations.length - 1) / 2) * 5;
        return <line key={j} x1={x} y1={cy - 4} x2={x} y2={cy + 4} className="trend-violation-tick" />;
      })}
    </g>
  );
}

function StripTooltip({ active, payload }: { active?: boolean; payload?: { payload: StripPoint }[] }) {
  if (!active || !payload?.length || payload[0].payload.violations.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="trend-tooltip">
      {point.violations.map((text) => <div key={text}>{point.label} · {text}</div>)}
    </div>
  );
}

function TrendPanel({ questionnaire, question, dayStrs, dayByDate, index, showXAxis, title }: {
  questionnaire: Questionnaire;
  question: Question;
  dayStrs: string[];
  dayByDate: Map<string, Day>;
  index: number;
  showXAxis: boolean;
  title: string;
}) {
  const color = `var(--viz-series-${index + 1})`;
  const data = panelData(questionnaire, question, dayStrs, dayByDate);
  const domain = domainFor(question, data.map((d) => d.value));
  const ticks = ticksFor(question);
  const labelFor = new Map(ticks.map((t) => [t.value, t.label]));
  return (
    <div className="trend-panel">
      <div className="trend-panel-title">
        <span className="trend-chip" style={{ background: color }} />
        {title}
      </div>
      <ResponsiveContainer width="100%" height={showXAxis ? 122 : 104}>
        <LineChart data={data} margin={{ top: 6, right: MARGIN_RIGHT, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal vertical={false} stroke="var(--viz-grid)" />
          <XAxis
            dataKey="label"
            scale="point"
            hide={!showXAxis}
            tickLine={false}
            axisLine={{ stroke: "var(--viz-baseline)" }}
            tick={{ fontSize: 11, fill: "var(--viz-muted)" }}
          />
          <YAxis
            domain={domain}
            ticks={ticks.map((t) => t.value)}
            tickFormatter={(v: number) => labelFor.get(v) ?? String(v)}
            width={Y_AXIS_WIDTH}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--viz-muted)" }}
          />
          <Tooltip content={<PanelTooltip />} />
          <Line dataKey="value" stroke={color} strokeWidth={2} isAnimationActive={false} connectNulls={false} dot={<PanelDot color={color} />} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// 7-day trend ending at the submitted date: one line panel per chartable question, then a strip
// marking days where any non-chartable question violated a rule.
export function TrendChart({ questionnaire, days, endDate }: { questionnaire: Questionnaire; days: Day[]; endDate: string }) {
  const { panels, strip } = trendPanels(questionnaire);
  if (panels.length === 0) return null;
  const dayStrs = last7Days(endDate);
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  return (
    <div className="trend" dir="ltr">
      <div className="trend-legend"><span className="trend-legend-dot" /> חריגה</div>
      {panels.map((question, index) => (
        <TrendPanel
          key={question.id}
          questionnaire={questionnaire}
          question={question}
          dayStrs={dayStrs}
          dayByDate={dayByDate}
          index={index}
          showXAxis={index === panels.length - 1}
          title={panelTitle(question)!}
        />
      ))}
      <ResponsiveContainer width="100%" height={22}>
        <ScatterChart margin={{ top: 2, right: MARGIN_RIGHT, bottom: 2, left: Y_AXIS_WIDTH }}>
          <XAxis dataKey="label" type="category" scale="point" hide />
          <YAxis dataKey="y" hide domain={[-1, 1]} />
          <Tooltip content={<StripTooltip />} />
          <Scatter data={stripData(questionnaire, strip, dayStrs, dayByDate)} shape={<StripTicks />} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
