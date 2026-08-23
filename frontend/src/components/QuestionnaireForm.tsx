import { useRef, useState } from "react";
import type { Choice, Derived, Questionnaire } from "../types";
import { questionTitle } from "../violations";
import { ChoiceFieldset } from "./ChoiceFieldset";
import { PointsSlider } from "./PointsSlider";

interface Props {
  questionnaire: Questionnaire;
  floors: Derived;
  // The selected day already has a stored record, so submitting replaces its answers.
  resubmitting: boolean;
  onSubmit: (answers: Record<string, number>) => void;
  onValidationError: (message: string) => void;
}

// Renders the day-end questionnaire: single questions as radio groups floored by the day's
// recorded meals, points questions as sliders pinned to the recorded sum. Radio questions rely
// on native required-field validation; sliders always hold a value, starting at their floor.
export function QuestionnaireForm({ questionnaire, floors, resubmitting, onSubmit, onValidationError }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const floorOf = (questionId: string): number =>
    questionId in floors ? floors[questionId as keyof Derived] : 0;
  const [answers, setAnswers] = useState<Record<string, number>>(() =>
    Object.fromEntries(questionnaire.questions
      .filter((q) => q.type === "points")
      .map((q) => [q.id, floorOf(q.id)])));
  // Single-type answers store their choice id alongside the numeric answer above: two choices
  // can share a value, and only the id tells the radio group which one is checked.
  const [selectedIds, setSelectedIds] = useState<Record<string, string>>({});

  const pickPoints = (questionId: string, value: number) =>
    setAnswers((a) => ({ ...a, [questionId]: value }));

  const pickChoice = (questionId: string, choice: Choice) => {
    setSelectedIds((s) => ({ ...s, [questionId]: choice.id }));
    setAnswers((a) => ({ ...a, [questionId]: choice.value }));
  };

  function handleSubmit() {
    if (!formRef.current!.reportValidity()) return;
    for (const question of questionnaire.questions) {
      const floor = floorOf(question.id);
      if (answers[question.id] < floor) {
        onValidationError(`הערך של ${questionTitle(question, "day")} לא יכול להיות נמוך מ-${floor} שנרשם ביומן`);
        return;
      }
    }
    onSubmit(answers);
  }

  return (
    <form ref={formRef}>
      {resubmitting && (
        <p className="notice">היום הזה כבר נשלח — שליחה חוזרת תחליף את התשובות שנשמרו</p>
      )}
      {questionnaire.questions.map((question) =>
        question.type === "points" ? (
          <PointsSlider key={question.id} question={question} value={answers[question.id]}
                        floor={floorOf(question.id)} onChange={(v) => pickPoints(question.id, v)} />
        ) : (
          <ChoiceFieldset key={question.id} question={question} selectedId={selectedIds[question.id]}
                          floor={floorOf(question.id)} onPick={(c) => pickChoice(question.id, c)} />
        ))}
      <button type="button" onClick={handleSubmit}>שליחה</button>
    </form>
  );
}
