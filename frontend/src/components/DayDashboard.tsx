import type { Derived, Meal, Questionnaire, TreatDaySettings } from "../types";
import { fallsOn } from "../dates";
import { carbsScales, excludedPoints } from "../derive";
import { EXCLUDED_LABEL, isViolating, scoreLabel } from "../violations";

// One-line summary of a day's derived values, shared by the live tracker header (client-derived)
// and the read-only history view (server-derived). Every figure is its own element so color can
// land on the number while its label stays in the body text color.
export function DayDashboard({ questionnaire, treatDay, date, derived, meals, onScoreClick }: {
  questionnaire: Questionnaire;
  treatDay: TreatDaySettings;
  // The day the figures describe; a treat-day breach keeps its mark and takes the softer paint.
  date: string;
  derived: Derived;
  // The meals the figures were derived from, read again for the score's flour-and-sugar part.
  meals: Meal[];
  // Opens the score's breakdown. Offered only from a score past the day rule: a score within it
  // has nothing to account for, so it stays plain text even when a handler is supplied.
  onScoreClick?: () => void;
}) {
  const carbsQuestion = questionnaire.questions.find((q) => q.id === "carbs")!;
  const softened = fallsOn(date, treatDay.weekday) ? " treat-day" : "";
  const heavy = isViolating(questionnaire, carbsQuestion.id, derived.carbs);
  const scales = carbsScales(carbsQuestion);
  const excluded = excludedPoints(meals, scales.weights, scales.additionValues, scales.amounts,
                                  scales.portions, scales.secondSource, scales.excluded);
  // A figure marks on its rule bound alone, never on a question's display floor. A day holding
  // no meals yet has nothing to judge: its zeros are what has not been recorded, not a bound
  // crossed.
  const valueClass = (questionId: string, value: number) =>
    derived.meals > 0 && isViolating(questionnaire, questionId, value)
      ? `value breach${softened}` : "value";
  return (
    <div className="tracker-dashboard">
      {/* No meal count: the meals themselves are listed right under the strip, open or folded. */}
      <span>
        חלון: <span className={valueClass("eating_window", derived.eating_window)}>
          {derived.eating_window}</span> שעות
      </span>
      <span>ירקות: <span className={valueClass("vegetables", derived.vegetables)}>
        {derived.vegetables}</span></span>
      <span>שומן: <span className={valueClass("fat", derived.fat)}>{derived.fat}</span></span>
      <strong title={carbsQuestion.tooltip} className={heavy ? `heavy-day${softened}` : undefined}>
        ציון: {heavy && onScoreClick !== undefined
          ? <button type="button" className="score score-link" aria-label="פירוט הציון"
                    onClick={onScoreClick}>{scoreLabel(derived.carbs)}</button>
          : <span className="score">{scoreLabel(derived.carbs)}</span>}
        {excluded > 0 && <>
          {" "}<span className="score-excluded" title={EXCLUDED_LABEL}>({scoreLabel(excluded)})</span>
        </>}
      </strong>
    </div>
  );
}
