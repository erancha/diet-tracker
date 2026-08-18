import type { AnswerValue, Day, Questionnaire } from "../types";
import { choiceLabel, isViolating, selectedIds } from "../violations";

interface Props {
  questionnaire: Questionnaire;
  days: Day[];
}

export function HistoryTable({ questionnaire, days }: Props) {
  const cellText = (questionId: string, value: AnswerValue) =>
    selectedIds(value).map((id) => choiceLabel(questionnaire, questionId, id)).join(" · ");

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
            <td>{day.date}</td>
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
