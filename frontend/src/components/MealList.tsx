import { carbsScales, mealWeights } from "../derive";
import type { Meal, Questionnaire } from "../types";
import { HIGH_GRADE_THRESHOLD } from "../violations";

// Row marker per addition id; a retired id falls back to its raw id, like retired grade choices.
const ADDITION_MARKERS: Record<string, string> = { sweet: "🍪", alcohol: "🍷", nuts: "🥜" };

// A day's meal list rendered newest first — the top row is the meal just recorded, the one the
// user checks or deletes — each row ending with the meal's effective points so the rows visibly
// sum to the day's carb score. Per-meal deletion renders only when a handler is supplied
// (the live tracker); the read-only history view passes none.
export function MealList({ questionnaire, meals, onDelete }: {
  questionnaire: Questionnaire;
  // Chronological, as the server stores them; rendering reverses to newest first.
  meals: Meal[];
  onDelete?: (id: string) => void;
}) {
  const carbsQuestion = questionnaire.questions.find((q) => q.id === "carbs")!;
  const timeOf = (at: string) => at.slice(11, 16);
  const newestFirst = [...meals].reverse();

  // A history day may reference a choice or addition id retired by a later questionnaire
  // version, making its weights unknowable here; per-meal points render only when the whole day
  // still resolves.
  const { weights, additionValues } = carbsScales(carbsQuestion);
  const points = meals.every((m) => weights[m.carbs_choice] !== undefined
      && m.additions.every((a) => additionValues[a] !== undefined))
    ? mealWeights(newestFirst, weights, additionValues)
    : undefined;

  return (
    <ul className="meal-list">
      {newestFirst.map((meal, index) => {
        // Retired choice ids fall back to the raw id and are never grade-highlighted.
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
              {meal.additions.map((id) => ` · ${ADDITION_MARKERS[id] ?? id}`).join("")}
              {points !== undefined && ` · ${points[index]}`}
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
