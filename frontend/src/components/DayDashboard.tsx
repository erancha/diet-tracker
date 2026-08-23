import type { Derived, Questionnaire } from "../types";
import { isHighScore } from "../violations";

// One-line summary of a day's derived values, shared by the live tracker header (client-derived)
// and the read-only history view (server-derived).
export function DayDashboard({ questionnaire, derived }: {
  questionnaire: Questionnaire;
  derived: Derived;
}) {
  const carbsQuestion = questionnaire.questions.find((q) => q.id === "carbs")!;
  return (
    <div className="tracker-dashboard">
      <span>ארוחות: {derived.meals}</span>
      <span>ירקות: {derived.vegetables}</span>
      <span>חלון: {derived.eating_window} שעות</span>
      <strong title={carbsQuestion.tooltip}
              className={isHighScore(carbsQuestion, derived.carbs) ? "high-score" : undefined}>
        ציון: {derived.carbs}
      </strong>
    </div>
  );
}
