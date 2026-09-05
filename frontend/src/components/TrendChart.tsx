import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Day, DayPayload, Question, Questionnaire } from "../types";
import { dayLabel, last7Days } from "../dates";
import { domainFor, liveTrendDay, ticksFor } from "../trend";
import { isViolating, panelTitle, ruleBoundLabel, trendPanels, valueLabel } from "../violations";

// Every panel reserves the same y-axis width, so the 7 day columns plot at identical x positions
// down the stack and the one visible date axis dates them all.
const Y_AXIS_WIDTH = 40;
const MARGIN_RIGHT = 14;

interface PanelPoint {
  date: string;
  label: string;
  // null charts as a gap: the day is missing or predates the question.
  value: number | null;
  choiceLabel: string | null;
  violating: boolean;
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
  const domain = domainFor(questionnaire, question, data.map((d) => d.value));
  const boundLabel = ruleBoundLabel(questionnaire, question.id);
  return (
    <div className="trend-panel">
      {/* The chart container is LTR for the axes; the heading flips back so the Hebrew title
          leads from the right and the limit note follows it in reading order. */}
      <div className="trend-panel-title" dir="rtl">
        <span className="trend-chip" style={{ background: color }} />
        {title}
        {boundLabel !== undefined && <span className="trend-panel-limit">(חריגה: {boundLabel})</span>}
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
            // Bold: the one visible date row serves every panel in the stack, not just its own.
            tick={{ fontSize: 11, fontWeight: 700, fill: "var(--viz-muted)" }}
          />
          <YAxis
            domain={domain}
            ticks={ticksFor(questionnaire, question)}
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

// 7-day trend: one line panel per chartable question. Ends at today once today has recorded
// meals — its running carb score charts live — else at the latest submitted date.
export function TrendChart({ questionnaire, days, today, endDate, headlineOnly = false }: {
  questionnaire: Questionnaire; days: Day[]; today: DayPayload; endDate: string;
  // Condensed rendering for the folded trends section: the legend and the headline panel alone —
  // trendPanels orders the summed carb score first, so that is the panel that stays on screen.
  headlineOnly?: boolean;
}) {
  const allPanels = trendPanels(questionnaire);
  const panels = headlineOnly ? allPanels.slice(0, 1) : allPanels;
  if (panels.length === 0) return null;
  const liveDay = liveTrendDay(today, days);
  const dayStrs = last7Days(liveDay?.date ?? endDate);
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  if (liveDay) dayByDate.set(liveDay.date, liveDay);
  return (
    <div className="trend" dir="ltr">
      {/* The chart container is LTR for the axes; the legend flips back so it leads from the
          right like the panel headings. */}
      <div className="trend-legend" dir="rtl"><span className="trend-legend-dot" /> חריגה</div>
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
    </div>
  );
}
