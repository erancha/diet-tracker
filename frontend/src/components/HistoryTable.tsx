import type { KeyboardEvent } from "react";
import type { Day, Questionnaire } from "../types";
import { isHighScore, isViolating, questionTitle, valueLabel } from "../violations";

interface Props {
  questionnaire: Questionnaire;
  days: Day[];
  // Dates whose rows offer deletion — the backend accepts deletes only for today and yesterday.
  deletableDates: Set<string>;
  // Today's row offers no read-only view: its live tracker is already open above the history.
  todayDate: string;
  onDelete: (date: string) => void;
  onView: (date: string) => void;
}

export function HistoryTable({ questionnaire, days, deletableDates, todayDate, onDelete, onView }: Props) {
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
            <td>
              {day.date}
              {deletableDates.has(day.date) && (
                <button type="button" className="delete-day" aria-label={`מחיקת הרשומה של ${day.date}`}
                  onClick={() => { if (window.confirm(`למחוק את הרשומה של ${day.date}?`)) onDelete(day.date); }}>🗑️</button>
              )}
            </td>
            {questionnaire.questions.map((q) => {
              if (!(q.id in day.answers)) return <td key={q.id}>—</td>;
              const value = day.answers[q.id];
              const viewable = q.type === "points" && day.date !== todayDate;
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
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
