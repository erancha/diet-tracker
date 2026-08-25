import type { Derived, Questionnaire } from "../types";
import { isHighScore } from "../violations";

// One-line summary of a day's derived values, shared by the live tracker header (client-derived)
// and the read-only history view (server-derived). Every figure is its own element so color can
// land on the number while its label stays in the body text color.
export function DayDashboard({ questionnaire, derived }: {
  questionnaire: Questionnaire;
  derived: Derived;
}) {
  const carbsQuestion = questionnaire.questions.find((q) => q.id === "carbs")!;
  return (
    <div className="tracker-dashboard">
      <span>ירקות: <span className="value">{derived.vegetables}</span></span>
      <span>חלון: <span className="value">{derived.eating_window}</span> שעות</span>
      <span>ארוחות: <span className="value">{derived.meals}</span></span>
      <strong title={carbsQuestion.tooltip}
              className={isHighScore(carbsQuestion, derived.carbs) ? "high-score" : undefined}>
        ציון: <span className="value">{derived.carbs}</span>
      </strong>
    </div>
  );
}
