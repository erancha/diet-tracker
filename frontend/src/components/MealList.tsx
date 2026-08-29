import { clockTimeOf } from "../dates";
import { carbsScales, mealWeights } from "../derive";
import type { Choice, Meal, Questionnaire } from "../types";
import { HIGH_GRADE_THRESHOLD } from "../violations";
import { Icon } from "./Icon";

// Row marker per addition id; a retired id falls back to its raw id, like retired grade choices.
const ADDITION_MARKERS: Record<string, string> = { sweet: "🍪", alcohol: "🍷", nuts: "🥜", fat: "🥑" };

// A day's meal list rendered newest first — the top row is the meal just recorded, the one the
// user checks, corrects or deletes — each row ending with the meal's effective points so the rows
// visibly sum to the day's carb score. Per-meal editing and deletion render only when their
// handlers are supplied (the live tracker); the read-only history view passes none.
export function MealList({ questionnaire, meals, onEdit, onDelete }: {
  questionnaire: Questionnaire;
  // Chronological, as the server stores them; rendering reverses to newest first.
  meals: Meal[];
  onEdit?: (meal: Meal) => void;
  onDelete?: (id: string) => void;
}) {
  const carbsQuestion = questionnaire.questions.find((q) => q.id === "carbs")!;
  const newestFirst = [...meals].reverse();

  // A history day may reference a choice or addition id retired by a later questionnaire
  // version, making its weights unknowable here; per-meal points render only when the whole day
  // still resolves.
  const { weights, additionValues, smallPortion } = carbsScales(carbsQuestion);
  const points = meals.every((m) => weights[m.carbs_choice] !== undefined
      && (m.second_source === null || weights[m.second_source.carbs_choice] !== undefined)
      && m.additions.every((a) => additionValues[a] !== undefined))
    ? mealWeights(newestFirst, weights, additionValues, smallPortion)
    : undefined;

  return (
    <ul className="meal-list">
      {newestFirst.map((meal, index) => {
        const choice = carbsQuestion.choices.find((c) => c.id === meal.carbs_choice);
        const second = meal.second_source === null ? undefined
          : carbsQuestion.choices.find((c) => c.id === meal.second_source!.carbs_choice);
        return (
          <li key={meal.id}>
            {/* Outside the text cell, so the row lays time and description out as two columns and
                a description too long for one line wraps against its own edge, not the time's. */}
            <strong className="meal-at">{clockTimeOf(meal.at)}</strong>
            <span className="meal-text">
              <Grade choice={choice} choiceId={meal.carbs_choice} />
              {/* A plate that drew on two carb sources names both, each highlighted on its own
                  grade; the row's points are their sum. */}
              {meal.second_source !== null && (
                <>
                  {" + "}
                  <Grade choice={second} choiceId={meal.second_source.carbs_choice} />
                </>
              )}
              {meal.vegetables && " · 🥗"}
              {meal.fruit && " · 🍎"}
              {meal.additions.map((id) => ` · ${ADDITION_MARKERS[id] ?? id}`).join("")}
            </span>
            {/* A bare number reads as nothing in particular; the carbs tooltip is what says it is
                this meal's contribution to the day's score. */}
            {points !== undefined && (
              <span className="meal-points" title={carbsQuestion.tooltip}>
                {" · "}{points[index]}
              </span>
            )}
            {/* Grouped into one cell so the pencil and bin travel together as the row's controls. */}
            <span className="meal-actions">
              {onEdit && (
                <button type="button" className="icon-only"
                        aria-label={`עריכת ארוחה ${clockTimeOf(meal.at)}`}
                        onClick={() => onEdit(meal)}>
                  <Icon name="edit" />
                </button>
              )}
              {onDelete && (
                <button type="button" className="icon-only"
                        aria-label={`מחיקת ארוחה ${clockTimeOf(meal.at)}`}
                        onClick={() => { if (window.confirm("למחוק את הארוחה?")) onDelete(meal.id); }}>
                  <Icon name="remove" />
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// One carb source's grade as the row names it. A choice id the current questionnaire has retired
// carries no weight here, so it falls back to the raw id and is never grade-highlighted.
function Grade({ choice, choiceId }: { choice: Choice | undefined; choiceId: string }) {
  return (
    <span className={choice !== undefined && choice.value > HIGH_GRADE_THRESHOLD
      ? "high-grade" : undefined}>
      {choice?.label ?? choiceId}
    </span>
  );
}
