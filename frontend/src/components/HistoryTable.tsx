import type { KeyboardEvent } from "react";
import type { Day, Questionnaire } from "../types";
import { weekdayDdmmLabel } from "../dates";
import { isHighScore, isViolating, questionTitle, valueLabel } from "../violations";

interface Props {
  questionnaire: Questionnaire;
  days: Day[];
  // Dates whose rows offer deletion — the backend accepts deletes only for today and yesterday.
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
    <button type="button" className="delete-day" aria-label={`מחיקת הרשומה של ${date}`}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (window.confirm(`למחוק את הרשומה של ${date}?`)) onDelete(date);
      }}>🗑️</button>
  );
}

export function HistoryTable({ questionnaire, days, deletableDates, viewedDate, onDelete, onView }: Props) {
  const cellText = (questionId: string, value: number) =>
    valueLabel(questionnaire.questions.find((q) => q.id === questionId)!, value);

  return (
    <table>
      <thead>
        <tr>
          <th>תאריך</th>
          {questionnaire.questions.map((q) => <th key={q.id} title={q.tooltip}>{questionTitle(q, "day")}</th>)}
        </tr>
      </thead>
      <tbody>
        {days.map((day) => (
          <tr key={day.date}>
            <td>{weekdayDdmmLabel(day.date)}</td>
            {questionnaire.questions.map((q, index) => {
              // Deletion rides in the row's last cell, where it costs no column width of its own.
              const deletion = index === questionnaire.questions.length - 1
                && day.date === viewedDate && deletableDates.has(day.date)
                ? <DeleteDayButton date={day.date} onDelete={onDelete} />
                : null;
              if (!(q.id in day.answers)) return <td key={q.id}>—{deletion}</td>;
              const value = day.answers[q.id];
              const viewable = q.type === "points";
              // The score column signals a high total with red text alone; the violation
              // background stays on the answer columns.
              const classes = (q.type === "points"
                ? [isHighScore(q, value) && "high-score", viewable && "view-day"]
                : [isViolating(questionnaire, q.id, value) && "violation"]
              ).filter(Boolean).join(" ");
              return (
                <td key={q.id} className={classes || undefined}
                    {...(viewable && {
                      role: "button", tabIndex: 0, "aria-label": `הצגת היומן של ${day.date}`,
                      onClick: () => onView(day.date),
                      onKeyDown: (e: KeyboardEvent) => {
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(day.date); }
                      },
                    })}>
                  {cellText(q.id, value)}
                  {viewable && " 📖"}
                  {deletion}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
