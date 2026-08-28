import { useEffect, useState } from "react";
import type { AnswerValue, Choice, Derived, Questionnaire } from "../types";
import { mayDiscardEdits } from "../edits";
import { questionTitle } from "../violations";
import { ChoiceFieldset, fieldsetChoices } from "./ChoiceFieldset";
import { PointsSlider } from "./PointsSlider";

interface Props {
  questionnaire: Questionnaire;
  floors: Derived;
  // The selected day's saved answers, or undefined for a day with no record yet. A recorded day
  // opens on its own figures, so submitting from here replaces them rather than starting over.
  stored?: Record<string, AnswerValue>;
  onSubmit: (answers: Record<string, number>) => void;
  onValidationError: (message: string) => void;
  // Raised while the answers differ from the ones the form opened on. The form's own discard
  // button covers the deliberate route out; the fold this form sits in and the day it is keyed by
  // live above it and discard just as thoroughly, so their owner needs the divergence to guard
  // them too.
  onPendingChange: (pending: boolean) => void;
}

// Renders the day-end questionnaire: single questions as radio groups floored by the day's
// recorded meals, points questions as sliders pinned to the recorded sum. Submission validates
// the radio groups here rather than through the browser's required-field check, whose bubble
// speaks the browser's UI language inside an all-Hebrew app; sliders always hold a value,
// starting at their floor.
// The state seeds once from the stored answers, so the caller re-keys this component when the
// selected day changes; answers edited since are restorable from here and reported up as pending.
export function QuestionnaireForm({ questionnaire, floors, stored, onSubmit, onValidationError,
                                    onPendingChange }: Props) {
  const floorOf = (questionId: string): number =>
    questionId in floors ? floors[questionId as keyof Derived] : 0;
  // The answers the form opened on, held apart from the live ones so an edit is recognizable as
  // such and restorable from them. A day with no record opens on its sliders' floors.
  const [openedOn] = useState<Record<string, number>>(() => ({
    ...Object.fromEntries(questionnaire.questions
      .filter((q) => q.type === "points")
      .map((q) => [q.id, floorOf(q.id)])),
    ...stored,
  }));
  const [answers, setAnswers] = useState(openedOn);
  // Single-type answers store their choice id alongside the numeric answer above: two choices
  // can share a value, and only the id tells the radio group which one is checked.
  const [openedOnSelections] = useState<Record<string, string>>(() =>
    stored === undefined ? {} : storedSelections(questionnaire, floorOf, stored));
  const [selectedIds, setSelectedIds] = useState(openedOnSelections);

  // Values alone decide this: a radio pick landing on the value already held would submit the
  // same day, so it is not an edit worth offering to undo.
  const pendingEdits = Object.keys({ ...openedOn, ...answers })
    .some((questionId) => answers[questionId] !== openedOn[questionId]);

  useEffect(() => {
    onPendingChange(pendingEdits);
    // Unmounting is the fold closing or the day switching: whatever was held here went with it.
    return () => onPendingChange(false);
  }, [pendingEdits, onPendingChange]);

  // Restoring both hooks to what they were seeded with puts the form back where it opened,
  // radio groups included — the discard is offered only while there is something to restore.
  function discardEdits() {
    if (!mayDiscardEdits(pendingEdits)) return;
    setAnswers(openedOn);
    setSelectedIds(openedOnSelections);
  }

  const pickPoints = (questionId: string, value: number) =>
    setAnswers((a) => ({ ...a, [questionId]: value }));

  const pickChoice = (questionId: string, choice: Choice) => {
    setSelectedIds((s) => ({ ...s, [questionId]: choice.id }));
    setAnswers((a) => ({ ...a, [questionId]: choice.value }));
  };

  function handleSubmit() {
    for (const question of questionnaire.questions) {
      if (question.type === "single" && selectedIds[question.id] === undefined) {
        onValidationError(`יש לבחור תשובה לשאלה: ${questionTitle(question, "day")}`);
        return;
      }
      const floor = floorOf(question.id);
      if (answers[question.id] < floor) {
        onValidationError(`הערך של ${questionTitle(question, "day")} לא יכול להיות נמוך מ-${floor} שנרשם ביומן`);
        return;
      }
    }
    onSubmit(answers);
  }

  return (
    <form>
      {stored !== undefined && (
        <p className="notice">היום הזה כבר נשלח — שליחה חוזרת תחליף את התשובות שנשמרו</p>
      )}
      {questionnaire.questions.map((question) =>
        question.type === "points" ? (
          <PointsSlider key={question.id} question={question} value={answers[question.id]}
                        floor={floorOf(question.id)} onChange={(v) => pickPoints(question.id, v)} />
        ) : (
          <ChoiceFieldset key={question.id} question={question} selectedId={selectedIds[question.id]}
                          floor={floorOf(question.id)} stored={stored?.[question.id]}
                          onPick={(c) => pickChoice(question.id, c)} />
        ))}
      <div className="form-actions">
        <button type="button" onClick={handleSubmit}>שליחה</button>
        {pendingEdits && (
          <button type="button" className="quiet destructive" onClick={discardEdits}>
            ביטול שינויים
          </button>
        )}
      </div>
    </form>
  );
}

// The radio-group selections a recorded day opens on: each single question's saved value matched
// to the option carrying it. fieldsetChoices synthesizes an option for a value outside the scale,
// so every saved value has one to match — a value with no option at all is a config/data fault
// and throws here rather than opening the day silently short an answer. The day-level single
// questions carry distinct values, so a value identifies its option.
function storedSelections(questionnaire: Questionnaire, floorOf: (questionId: string) => number,
                          stored: Record<string, AnswerValue>): Record<string, string> {
  return Object.fromEntries(questionnaire.questions
    .filter((question) => question.type === "single" && question.id in stored)
    .map((question) => [question.id,
      fieldsetChoices(question, floorOf(question.id), stored[question.id])
        .find((choice) => choice.value === stored[question.id])!.id]));
}
