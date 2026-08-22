import type { Meal, Questionnaire } from "../types";
import { HIGH_GRADE_THRESHOLD } from "../violations";

// A day's chronological meal list. Per-meal deletion renders only when a handler is supplied
// (the live tracker); the read-only history view passes none.
export function MealList({ questionnaire, meals, onDelete }: {
  questionnaire: Questionnaire;
  meals: Meal[];
  onDelete?: (id: string) => void;
}) {
  const carbsQuestion = questionnaire.questions.find((q) => q.id === "carbs")!;
  const timeOf = (at: string) => at.slice(11, 16);

  return (
    <ul className="meal-list">
      {meals.map((meal) => {
        // Old meals may reference a choice id retired by a later questionnaire version; those
        // fall back to the raw id and are never grade-highlighted.
        const choice = carbsQuestion.choices.find((c) => c.id === meal.carbs_choice);
        return (
          <li key={meal.id}>
            <span>
              <strong>{timeOf(meal.at)}</strong> ·{" "}
              <span className={choice !== undefined && choice.value > HIGH_GRADE_THRESHOLD
                ? "high-grade" : undefined}>
                {choice?.label ?? meal.carbs_choice}
              </span>
              {meal.vegetables && " · 🥗"}
              {meal.fruit && " · 🍎"}
              {meal.sweet && " · 🍪"}
            </span>
            {onDelete && (
              <button type="button" className="delete-meal" aria-label={`מחיקת ארוחה ${timeOf(meal.at)}`}
                      onClick={() => { if (window.confirm("למחוק את הארוחה?")) onDelete(meal.id); }}>
                🗑️
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
