import type { Choice, Question } from "../types";
import { questionTitle, valueLabel } from "../violations";

// One single-type question as a radio group storing the picked choice's id. Distinct choices can
// share a numeric value (e.g. two carbs choices both worth 4 points), so the id — not the value —
// is what identifies the selection. Choices below the tracked floor are disabled: recorded meals
// are evidence, and the day-end answer can only admit more, never less. When the floor tops the
// whole scale, the group offers the tracked value itself as an extra option — the server accepts
// the exact floor even off the choice scale, and a fully disabled group would otherwise skip
// native required validation and submit without this answer. The scope prop picks which heading
// qualifier the legend carries (a day's summed answer vs. one meal's grade).
export function ChoiceFieldset({ question, selectedId, floor, scope = "day", onPick }: {
  question: Question;
  selectedId: string | undefined;
  floor?: number;
  scope?: "day" | "meal";
  onPick: (choice: Choice) => void;
}) {
  const trackedChoice: Choice | undefined =
    floor !== undefined && question.choices.every((choice) => choice.value < floor)
      ? { id: `${question.id}-floor`, label: valueLabel(question, floor), value: floor }
      : undefined;
  const choices = trackedChoice ? [...question.choices, trackedChoice] : question.choices;
  return (
    <fieldset>
      <legend>{questionTitle(question, scope)}</legend>
      {choices.map((choice) => (
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
