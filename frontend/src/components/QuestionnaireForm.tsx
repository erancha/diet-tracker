import { useRef, useState } from "react";
import type { AnswerValue, Questionnaire } from "../types";

interface Props {
  questionnaire: Questionnaire;
  onSubmit: (answers: Record<string, AnswerValue>) => void;
  onValidationError: (message: string) => void;
}

// Renders the questionnaire as controlled radio/checkbox groups. Single questions rely on native
// required-field validation; multi questions enforce an at-least-one rule explicitly because
// HTML has no required semantics for checkbox groups.
export function QuestionnaireForm({ questionnaire, onSubmit, onValidationError }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  // Multi answers start as empty arrays so selection state is always an array; single answers
  // are absent until picked, which native validation guarantees never survives to submit.
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() =>
    Object.fromEntries(questionnaire.questions.filter((q) => q.type === "multi").map((q) => [q.id, []])));

  const pickSingle = (questionId: string, choiceId: string) =>
    setAnswers((a) => ({ ...a, [questionId]: choiceId }));

  const toggleMulti = (questionId: string, choiceId: string, checked: boolean) =>
    setAnswers((a) => {
      const current = a[questionId] as string[];
      return { ...a, [questionId]: checked ? [...current, choiceId] : current.filter((id) => id !== choiceId) };
    });

  function handleSubmit() {
    if (!formRef.current!.reportValidity()) return;
    for (const question of questionnaire.questions) {
      if (question.type === "multi" && (answers[question.id] as string[]).length === 0) {
        onValidationError(`יש לסמן לפחות אפשרות אחת בשאלת ${question.text}`);
        return;
      }
    }
    onSubmit(answers);
  }

  return (
    <form ref={formRef}>
      {questionnaire.questions.map((question) => (
        <fieldset key={question.id}>
          <legend>{question.text}</legend>
          {question.choices.map((choice) => (
            <label key={choice.id}>
              {question.type === "multi" ? (
                <input
                  type="checkbox"
                  name={question.id}
                  checked={(answers[question.id] as string[]).includes(choice.id)}
                  onChange={(e) => toggleMulti(question.id, choice.id, e.target.checked)}
                />
              ) : (
                <input
                  type="radio"
                  name={question.id}
                  required
                  checked={answers[question.id] === choice.id}
                  onChange={() => pickSingle(question.id, choice.id)}
                />
              )}
              {" "}{choice.label}
            </label>
          ))}
        </fieldset>
      ))}
      <button type="button" onClick={handleSubmit}>שליחה</button>
    </form>
  );
}
