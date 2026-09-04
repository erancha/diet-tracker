import { useState, type KeyboardEvent } from "react";
import type { Day, Questionnaire } from "../types";
import { daysBefore, weekdayDdmmLabel } from "../dates";
import { headedValue, isBoundValue, isViolating, questionTitle } from "../violations";
import { Icon } from "./Icon";

// Window lengths the reader can choose between, shortest first. The longest is bounded by the
// API's 30-day lookback — nothing older reaches the history response to be shown.
const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

interface Props {
  questionnaire: Questionnaire;
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
    <button type="button" className="icon-only delete-day" aria-label={`מחיקת הרשומה של ${date}`}
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

export function HistoryTable({ questionnaire, days, today, deletableDates, viewedDate, onDelete, onView }: Props) {
  const [range, setRange] = useState<Range>(RANGES[0]);
  const cellText = (questionId: string, value: number) =>
    headedValue(questionnaire.questions.find((q) => q.id === questionId)!, value);

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
              {questionnaire.questions.map((q) => <th key={q.id} title={q.tooltip}>{questionTitle(q, "day")}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleDays.map((day) => (
              <tr key={day.date}>
                <td>{weekdayDdmmLabel(day.date)}</td>
                {questionnaire.questions.map((q, index) => {
                  // Deletion rides in the row's last cell, where it costs no column width of its own.
                  const deletion = index === questionnaire.questions.length - 1
                    && day.date === viewedDate && deletableDates.has(day.date)
                    ? <DeleteDayButton date={day.date} onDelete={onDelete} />
                    : null;
                  const deleteClass = deletion === null ? undefined : "has-delete";
                  if (!(q.id in day.answers)) return <td key={q.id} className={deleteClass}>—{deletion}</td>;
                  const value = day.answers[q.id];
                  const viewable = q.type === "points";
                  const violating = isViolating(questionnaire, q.id, value);
                  // The score column signals a heavy day with red text alone; the violation
                  // background stays on the answer columns, where a value under its question's
                  // warn floor reddens without it.
                  const classes = [
                    ...(q.type === "points"
                      ? [violating && "heavy-day", viewable && "view-day"]
                      : [violating && "violation",
                         q.warn_below !== undefined && value < q.warn_below && "shortfall",
                         isBoundValue(q, value) && "bound"]),
                    deleteClass,
                  ].filter(Boolean).join(" ");
                  return (
                    <td key={q.id} className={classes || undefined}
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
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
