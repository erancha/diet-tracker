import type { Choice, Question } from "../types";

// One single-type question as a radio group storing the picked choice's id. Distinct choices can
// share a numeric value (e.g. two carbs choices both worth 4 points), so the id — not the value —
// is what identifies the selection. Choices below the tracked floor are disabled: recorded meals
// are evidence, and the day-end answer can only admit more, never less. Reused by the day-end
// form and the tracker's close-day water question.
export function ChoiceFieldset({ question, selectedId, floor, onPick }: {
  question: Question;
  selectedId: string | undefined;
  floor?: number;
  onPick: (choice: Choice) => void;
}) {
  return (
    <fieldset>
      <legend>{question.text}</legend>
      {question.choices.map((choice) => (
        <label key={choice.id}>
          <input
            type="radio"
            name={question.id}
            required
            disabled={floor !== undefined && choice.value < floor}
            checked={selectedId === choice.id}
            onChange={() => onPick(choice)}
          />
          {" "}{choice.label}
        </label>
      ))}
    </fieldset>
  );
}
