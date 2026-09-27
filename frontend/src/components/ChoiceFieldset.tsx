import { choiceLabel } from "../gradeLabels";
import { useReveal } from "../reveal";
import type { Choice, Question } from "../types";
import { questionTitle, valueLabel } from "../violations";

// How long a choice just picked reads in full — spelled out while names are condensed, wrapped
// past its one-line cut while they are expanded — so whoever picked it sees what the grade
// stands for before it trims back. Exported for tests that wait the moment out.
export const PICK_REVEAL_MS = 2000;

// A question's configured choices plus one synthesized option per value the scale cannot express:
// a floor topping every choice, so a group disabled end to end stays answerable (the server
// accepts the exact floor off-scale), and a stored answer no choice carries, so a reopened day
// shows the saved figure rather than a blank group that would drop it on resubmission. Each
// synthesized option sits before the first choice worth more, so the group reads as one scale.
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

// One single-type question as a radio group storing the picked choice's id, since distinct
// choices can share a value. Choices below the tracked floor are disabled: recorded meals are
// evidence, so the day-end answer can only admit more. `required` informs assistive tech only;
// enclosing forms validate themselves, since the browser's own message would not be in Hebrew.
export function ChoiceFieldset({ question, selectedId, floor, stored, scope = "day",
                                expandLabels = true, onPick }: {
  question: Question;
  selectedId: string | undefined;
  floor?: number;
  // Whether a choice listing what it covers spells that list out. Only the carbs grades carry one,
  // so every other question reads the same either way and the default leaves them alone.
  expandLabels?: boolean;
  // The day's saved answer when a recorded day is open for editing, so an off-scale figure still
  // has an option to check.
  stored?: number;
  // Whether the legend heads a day's summed answer or one meal's grade.
  scope?: "day" | "meal";
  onPick: (choice: Choice) => void;
}) {
  const choices = fieldsetChoices(question, floor, stored);
  // The id of the choice reading in full for its moment.
  const reveal = useReveal<string>();
  const pick = (choice: Choice) => {
    onPick(choice);
    if (choice.examples !== undefined) reveal.reveal(choice.id, PICK_REVEAL_MS);
  };
  return (
    <fieldset className={expandLabels ? undefined : "condensed"}>
      <legend>{questionTitle(question, scope)}</legend>
      {choices.map((choice) => {
        const revealed = choice.id === reveal.revealed;
        return (
          <label key={choice.id} className={revealed ? "revealed" : undefined}
                 style={revealed ? reveal.style : undefined}>
            <input
              type="radio"
              name={question.id}
              required
              disabled={floor !== undefined && choice.value < floor}
              checked={selectedId === choice.id}
              onChange={() => pick(choice)}
            />
            <span className="choice-text">{choiceLabel(choice, expandLabels || revealed)}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
