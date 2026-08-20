import type { Day, Questionnaire } from "../types";
import { isViolating, valueLabel } from "../violations";

interface Props {
  questionnaire: Questionnaire;
  days: Day[];
  // Dates whose rows offer deletion — the backend accepts deletes only for today and yesterday.
  deletableDates: Set<string>;
  onDelete: (date: string) => void;
}

export function HistoryTable({ questionnaire, days, deletableDates, onDelete }: Props) {
  const cellText = (questionId: string, value: number) =>
    valueLabel(questionnaire.questions.find((q) => q.id === questionId)!, value);

  return (
    <table>
      <thead>
        <tr>
          <th>תאריך</th>
          {questionnaire.questions.map((q) => <th key={q.id}>{q.text}</th>)}
        </tr>
      </thead>
      <tbody>
        {days.map((day) => (
          <tr key={day.date}>
            <td>
              {day.date}
              {deletableDates.has(day.date) && (
                <button type="button" className="delete-day" aria-label={`מחיקת הרשומה של ${day.date}`}
                  onClick={() => onDelete(day.date)}>🗑️</button>
              )}
            </td>
            {questionnaire.questions.map((q) =>
              q.id in day.answers ? (
                <td key={q.id} className={isViolating(questionnaire, q.id, day.answers[q.id]) ? "violation" : undefined}>
                  {cellText(q.id, day.answers[q.id])}
                </td>
              ) : (
                <td key={q.id}>—</td>
              ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
