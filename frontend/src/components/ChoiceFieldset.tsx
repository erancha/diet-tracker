import type { Choice, Question } from "../types";
import { questionTitle, valueLabel } from "../violations";

// The options a question offers: its configured choices, plus one synthesized option per value the
// scale cannot express. Two such values arise, and they coincide whenever the tracker closed the
// day: a floor topping every choice, so that a group disabled end to end still has something
// pickable — the server accepts the exact floor off-scale, and an all-disabled group would
// otherwise skip native required validation and submit without the answer; and a stored answer no
// choice carries, so that reopening a recorded day shows the figure actually saved rather than a
// blank group that would drop it on resubmission.
//
// Each synthesized option is seated before the first choice worth more than it, so a group reads
// as one ordered scale rather than a list with a stray value after its end. Configured choices
// keep their config order, which the carbs grade picker relies on to rank equal-valued grades.
export function fieldsetChoices(question: Question, floor?: number, stored?: number): Choice[] {
  const offScale: number[] = [];
  if (floor !== undefined && question.choices.every((choice) => choice.value < floor)) {
    offScale.push(floor);
  }
  if (stored !== undefined && !question.choices.some((choice) => choice.value === stored)
      && !offScale.includes(stored)) {
    offScale.push(stored);
  }
  const choices = [...question.choices];
  for (const value of offScale) {
    const seat = choices.findIndex((choice) => choice.value > value);
    const synthesized = { id: `${question.id}-${value}`, label: valueLabel(question, value), value };
    choices.splice(seat === -1 ? choices.length : seat, 0, synthesized);
  }
  return choices;
}

// One single-type question as a radio group storing the picked choice's id. Distinct choices can
// share a numeric value (e.g. two carbs choices both worth 4 points), so the id — not the value —
// is what identifies the selection. Choices below the tracked floor are disabled: recorded meals
// are evidence, and the day-end answer can only admit more, never less. The scope prop picks which
// heading qualifier the legend carries (a day's summed answer vs. one meal's grade).
export function ChoiceFieldset({ question, selectedId, floor, stored, scope = "day", onPick }: {
  question: Question;
  selectedId: string | undefined;
  floor?: number;
  // The day's saved answer when a recorded day is open for editing, so an off-scale figure still
  // has an option to check.
  stored?: number;
  scope?: "day" | "meal";
  onPick: (choice: Choice) => void;
}) {
  const choices = fieldsetChoices(question, floor, stored);
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
