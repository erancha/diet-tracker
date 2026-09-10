import type { Derived, Questionnaire } from "../types";
import { breachesLimit, isViolating, scoreLabel } from "../violations";

// One-line summary of a day's derived values, shared by the live tracker header (client-derived)
// and the read-only history view (server-derived). Every figure is its own element so color can
// land on the number while its label stays in the body text color.
export function DayDashboard({ questionnaire, derived }: {
  questionnaire: Questionnaire;
  derived: Derived;
}) {
  const carbsQuestion = questionnaire.questions.find((q) => q.id === "carbs")!;
  // A day holding no meals yet has nothing to judge: its zeros are what has not been recorded,
  // not a floor missed or a bound crossed.
  const valueClass = (questionId: string, value: number) =>
    derived.meals > 0 && breachesLimit(questionnaire, questionId, value) ? "value breach" : "value";
  return (
    <div className="tracker-dashboard">
      {/* The window rides the meal count in parentheses: the two describe the same row of
          recorded meals — how many, and the hours they span — so they read as one figure. */}
      <span>
        ארוחות: <span className="value">{derived.meals}</span>{" "}
        (חלון: <span className={valueClass("eating_window", derived.eating_window)}>
          {derived.eating_window}</span> שעות)
      </span>
      <span>ירקות: <span className={valueClass("vegetables", derived.vegetables)}>
        {derived.vegetables}</span></span>
      <strong title={carbsQuestion.tooltip}
              className={isViolating(questionnaire, carbsQuestion.id, derived.carbs)
                ? "heavy-day" : undefined}>
        ציון: <span className="score">{scoreLabel(derived.carbs)}</span>
      </strong>
    </div>
  );
}
