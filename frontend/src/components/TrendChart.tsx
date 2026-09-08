import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, usePlotArea, XAxis, YAxis } from "recharts";
import type { Day, DayPayload, Question, Questionnaire, TreatDaySettings } from "../types";
import { dayLabel, last7Days } from "../dates";
import { domainFor, liveTrendDay, ticksFor, treatDayColumn } from "../trend";
import { isViolating, panelTitle, ruleBoundLabel, scoreLabel, trendPanels, valueLabel } from "../violations";

// Every panel reserves the same y-axis width, so the 7 day columns plot at identical x positions
// down the stack and the one visible date axis dates them all.
const Y_AXIS_WIDTH = 40;
const MARGIN_RIGHT = 14;

// What the second line names in the panel heading and the tooltip: the flour grades and sugar the
// program's six non-treat days exclude, which is what the subtotal sums.
const EXCLUDED_LABEL = "קמחים וסוכרים";

// What the framed column names: the weekday the program aims its treat meal at.
const TREAT_DAY_LABEL = "יום פינוק";

interface PanelPoint {
  date: string;
  label: string;
  // null charts as a gap: the day is missing or predates the question.
  value: number | null;
  // The excluded part of the day's score, on the panel that decomposes it; null on every other
  // panel and on a gap day.
  excluded: number | null;
  choiceLabel: string | null;
  violating: boolean;
}

function panelData(questionnaire: Questionnaire, question: Question, dayStrs: string[], dayByDate: Map<string, Day>, decomposed: boolean): PanelPoint[] {
  return dayStrs.map((date) => {
    const gap: PanelPoint = { date, label: dayLabel(date), value: null, excluded: null,
                              choiceLabel: null, violating: false };
    const day = dayByDate.get(date);
    if (!day || !(question.id in day.answers)) return gap;
    const value = day.answers[question.id];
    return { ...gap, value, excluded: decomposed ? day.excluded : null,
             choiceLabel: valueLabel(question, value),
             violating: isViolating(questionnaire, question.id, value) };
  });
}

// The treat day's column, marked on the panel that charts the carb score: the target the program
// aims its treat meal at, so a lift between the two lines reads as a treat meal taken on the
// intended day and a lift outside them as one taken off it. Only the verticals are drawn — a
// closed box would parallel the gridlines it crosses, while two lines read as the lane the day
// sits in. The x-axis is a point scale, which spreads the categories evenly with the first and
// last sitting on the plot area's edges, so a column is one such step wide and the outermost
// columns are marked half a step wide, their outer line falling on the plot's own edge.
function TreatDayFrame({ column, columns }: { column: number; columns: number }) {
  const plot = usePlotArea();
  // usePlotArea answers undefined outside a chart context, where there is no column to frame.
  if (plot === undefined) return null;
  const step = plot.width / (columns - 1);
  const left = Math.max(plot.x, plot.x + column * step - step / 2);
  const right = Math.min(plot.x + plot.width, plot.x + column * step + step / 2);
  // An outermost column is marked half a step wide, too narrow for a centered label; there the
  // label runs from the inner line instead, keeping it off the axis beside it.
  const anchor = column === 0 ? "start" : column === columns - 1 ? "end" : "middle";
  const labelX = { start: left, end: right, middle: (left + right) / 2 }[anchor];
  const bottom = plot.y + plot.height;
  return (
    <g className="trend-treat-day">
      <line x1={left} y1={plot.y} x2={left} y2={bottom} />
      <line x1={right} y1={plot.y} x2={right} y2={bottom} />
      <text x={labelX} y={plot.y + 9} textAnchor={anchor}>{TREAT_DAY_LABEL}</text>
    </g>
  );
}

function PanelDot({ cx, cy, payload, color }: { cx?: number; cy?: number; payload?: PanelPoint; color: string }) {
  if (cx == null || cy == null || payload!.value == null) return null;
  const violating = payload!.violating;
  return <circle cx={cx} cy={cy} r={violating ? 4.5 : 4} fill={violating ? "var(--viz-critical)" : color} />;
}

function PanelTooltip({ active, payload }: { active?: boolean; payload?: { payload: PanelPoint }[] }) {
  if (!active || !payload?.length || payload[0].payload.value == null) return null;
  const point = payload[0].payload;
  return (
    <div className="trend-tooltip">
      {dayLabel(point.date)} · {point.choiceLabel}
      {point.excluded !== null && ` · ${EXCLUDED_LABEL} ${scoreLabel(point.excluded)}`}
    </div>
  );
}

function TrendPanel({ questionnaire, question, dayStrs, dayByDate, index, showXAxis, title, treatDay }: {
  questionnaire: Questionnaire;
  question: Question;
  dayStrs: string[];
  dayByDate: Map<string, Day>;
  index: number;
  showXAxis: boolean;
  title: string;
  treatDay: TreatDaySettings;
}) {
  const color = `var(--viz-series-${index + 1})`;
  // The excluded subtotal is a decomposition of the carb score alone, so it is that panel that
  // gains the second line and the treat day the score is read against.
  const decomposed = question.id === "carbs";
  const data = panelData(questionnaire, question, dayStrs, dayByDate, decomposed);
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
        {decomposed && (
          <span className="trend-panel-excluded">
            <span className="trend-chip" style={{ background: "var(--viz-excluded)" }} />
            {EXCLUDED_LABEL}
          </span>
        )}
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
          {/* Both below the score line in the markup, so the score draws over them where they
              meet. */}
          {decomposed && (
            <>
              <TreatDayFrame column={treatDayColumn(dayStrs, treatDay.weekday)} columns={dayStrs.length} />
              <Line dataKey="excluded" stroke="var(--viz-excluded)" strokeWidth={2} strokeDasharray="4 3" isAnimationActive={false} connectNulls={false} dot={{ r: 2.5, fill: "var(--viz-excluded)", stroke: "none" }} />
            </>
          )}
          <Line dataKey="value" stroke={color} strokeWidth={2} isAnimationActive={false} connectNulls={false} dot={<PanelDot color={color} />} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// 7-day trend: one line panel per chartable question. Ends at today once today has recorded
// meals — its running carb score charts live — else at the latest submitted date.
export function TrendChart({ questionnaire, days, today, endDate, loadedInMs, treatDay, headlineOnly = false }: {
  questionnaire: Questionnaire; days: Day[]; today: DayPayload; endDate: string;
  // The weekday the program's treat meal is aimed at, framed on the carb panel as the target the
  // week's scores are read against.
  treatDay: TreatDaySettings;
  // How long the history request took, shown in the legend: the chart's data is what that
  // request carries, so the wait belongs on the chart it delayed. Null for every account but the
  // developer's, which sees no timing at all.
  loadedInMs: number | null;
  // Condensed rendering for the folded trends section: the legend and the headline panel alone —
  // trendPanels orders the summed carb score first, so that is the panel that stays on screen.
  headlineOnly?: boolean;
}) {
  const allPanels = trendPanels(questionnaire);
  const panels = headlineOnly ? allPanels.slice(0, 1) : allPanels;
  if (panels.length === 0) return null;
  const liveDay = liveTrendDay(questionnaire, today, days);
  const dayStrs = last7Days(liveDay?.date ?? endDate);
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  if (liveDay) dayByDate.set(liveDay.date, liveDay);
  return (
    <div className="trend" dir="ltr">
      {/* The chart container is LTR for the axes; the legend flips back so it leads from the
          right like the panel headings. */}
      <div className="trend-legend" dir="rtl">
        <span className="trend-legend-dot" /><span>חריגה</span>
        {loadedInMs !== null
          && <span className="trend-legend-timing">טעינה: {loadedInMs}ms</span>}
      </div>
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
          treatDay={treatDay}
        />
      ))}
    </div>
  );
}
