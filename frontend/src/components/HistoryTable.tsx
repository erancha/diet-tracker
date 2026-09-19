import { Fragment, useState, type KeyboardEvent } from "react";
import type { Day, Questionnaire, TreatDaySettings } from "../types";
import { daysBefore, fallsOn, weekdayDdmmLabel } from "../dates";
import { EXCLUDED_SCORE_LABEL, headedValue, isBoundValue, isViolating, panelTitle, questionTitle, scoreLabel }
  from "../violations";
import { Icon } from "./Icon";

// Window lengths the reader can choose between, shortest first. The longest is bounded by the
// API's 30-day lookback — nothing older reaches the history response to be shown.
const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

interface Props {
  questionnaire: Questionnaire;
  // The weekday whose crossings paint softer: judged like any day, but what it costs is what it
  // is for.
  treatDay: TreatDaySettings;
  days: Day[];
  // Anchors the visible window: rows are kept from this date back over the chosen range. It is
  // today rather than the newest recorded date, so a stretch with nothing recorded reads as the
  // gap it is instead of scrolling older days up into the week.
  today: string;
  // Dates whose rows offer deletion — today, and yesterday only while its small-hours delete
  // bound still holds, matching the window the backend enforces.
  deletableDates: Set<string>;
  // The date whose day view is open, or null. Deletion is offered only there, so on a narrow
  // screen a mis-tap cannot delete a day the user has not opened and looked at.
  viewedDate: string | null;
  onDelete: (date: string) => void;
  onView: (date: string) => void;
}

// The cell holding this button doubles as the day-view control, so its own click and key
// activation must stop at the button instead of also opening the day it deletes.
function DeleteDayButton({ date, onDelete }: { date: string; onDelete: (date: string) => void }) {
  return (
    <button type="button" className="glyph delete-day" aria-label={`מחיקת הרשומה של ${date}`}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (window.confirm(`למחוק את הרשומה של ${date}?`)) onDelete(date);
      }}><Icon name="remove" /></button>
  );
}

function daysWithin(days: Day[], today: string, range: Range): Day[] {
  return days.filter((day) => day.date >= daysBefore(today, range - 1));
}

// A wider range is offered only where the history reaches past every range already on offer: one
// that would redraw the same rows is a control that appears to do nothing.
function offeredRanges(days: Day[], today: string): Range[] {
  const [shortest, ...wider] = RANGES;
  const offered: Range[] = [shortest];
  let widest = daysWithin(days, today, shortest).length;
  for (const range of wider) {
    const reach = daysWithin(days, today, range).length;
    if (reach > widest) {
      offered.push(range);
      widest = reach;
    }
  }
  return offered;
}

function RangePicker({ ranges, value, onChange }: {
  ranges: Range[]; value: Range; onChange: (value: Range) => void;
}) {
  // A lone range is no choice to make, so the row of controls goes rather than standing there
  // permanently checked.
  if (ranges.length < 2) return null;
  return (
    <div className="range-picker">
      טווח:
      {ranges.map((range) => (
        <label key={range}>
          <input type="radio" name="history-range" checked={value === range}
                 onChange={() => onChange(range)} />
          {" "}{range} ימים
        </label>
      ))}
    </div>
  );
}

export function HistoryTable({ questionnaire, treatDay, days, today, deletableDates, viewedDate, onDelete, onView }: Props) {
  const [range, setRange] = useState<Range>(RANGES[0]);
  const cellText = (questionId: string, value: number) =>
    headedValue(questionnaire.questions.find((q) => q.id === questionId)!, value);

  // The columns the table carries. A question that charts a trend panel is read there instead, so
  // only the ones charting nowhere tabulate — except the score, which stays as the row's headline
  // and the control that opens a day's log.
  const columns = questionnaire.questions.filter(
    (q) => panelTitle(q) === undefined || q.type === "points");
  // The score column, whose crossing the row's ground reports. A questionnaire without one leaves
  // every row plain.
  const scoreQuestion = columns.find((q) => q.type === "points");

  const offered = offeredRanges(days, today);
  // Deleting the last day beyond the chosen range withdraws that range mid-choice; the window
  // falls back to the default rather than leaving the picker with nothing marked.
  const active = offered.includes(range) ? range : RANGES[0];
  const visibleDays = daysWithin(days, today, active);

  return (
    <>
      <RangePicker ranges={offered} value={active} onChange={setRange} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>תאריך</th>
              {columns.map((q) => (q.type === "points"
                ? <Fragment key={q.id}>
                    <th>{EXCLUDED_SCORE_LABEL}</th>
                    <th title={q.tooltip}>{questionTitle(q, "day")}</th>
                  </Fragment>
                : <th key={q.id} title={q.tooltip}>{questionTitle(q, "day")}</th>))}
            </tr>
          </thead>
          <tbody>
            {visibleDays.map((day) => {
              // The day's score crossing its rule is what the row's ground reports, and a treat
              // day's crossing paints amber rather than red. The score column carries no mark of
              // its own: the ground behind it says the same thing across the whole row.
              const heavy = scoreQuestion !== undefined && scoreQuestion.id in day.answers
                && isViolating(questionnaire, scoreQuestion.id, day.answers[scoreQuestion.id]);
              const softened = heavy && fallsOn(day.date, treatDay.weekday);
              return (
              <tr key={day.date}
                  className={[heavy && "heavy-row", softened && "treat-day"]
                    .filter(Boolean).join(" ") || undefined}>
                <td>{weekdayDdmmLabel(day.date)}</td>
                {columns.map((q, index) => {
                  // Deletion rides in the row's last cell, where it costs no column width of its own.
                  const deletion = index === columns.length - 1
                    && day.date === viewedDate && deletableDates.has(day.date)
                    ? <DeleteDayButton date={day.date} onDelete={onDelete} />
                    : null;
                  const deleteClass = deletion === null ? undefined : "has-delete";
                  if (!(q.id in day.answers)) return <td key={q.id} className={deleteClass}>—{deletion}</td>;
                  const value = day.answers[q.id];
                  const viewable = q.type === "points";
                  const violating = isViolating(questionnaire, q.id, value);
                  // A bound label is truncated to the row's single-line height by the stylesheet,
                  // so its cell carries the full wording in its title.
                  const bound = q.type !== "points" && isBoundValue(q, value);
                  // The violation background belongs to the answer columns, where a value under
                  // its question's warn floor reddens without it. The score column leaves its
                  // crossing to the row's ground and keeps only what opens the day view.
                  const classes = [
                    ...(q.type === "points"
                      ? [viewable && "view-day"]
                      : [violating && "violation",
                         violating && fallsOn(day.date, treatDay.weekday) && "treat-day",
                         q.warn_below !== undefined && value < q.warn_below && "shortfall",
                         q.norm !== undefined && value !== q.norm && "off-norm",
                         bound && "bound"]),
                    deleteClass,
                  ].filter(Boolean).join(" ");
                  const cell = (
                    <td key={q.id} className={classes || undefined}
                        title={bound ? cellText(q.id, value) : undefined}
                        {...(viewable && {
                          role: "button", tabIndex: 0, "aria-label": `הצגת היומן של ${day.date}`,
                          onClick: () => onView(day.date),
                          onKeyDown: (e: KeyboardEvent) => {
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(day.date); }
                          },
                        })}>
                      {viewable
                        ? <><span className="day-score">{cellText(q.id, value)}</span>{" "}
                            <Icon name="openDay" /></>
                        : cellText(q.id, value)}
                      {deletion}
                    </td>
                  );
                  // The excluded subtotal decomposes the score, so it reads immediately beside it.
                  return q.type === "points"
                    ? <Fragment key={q.id}><td>{scoreLabel(day.excluded)}</td>{cell}</Fragment>
                    : cell;
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
