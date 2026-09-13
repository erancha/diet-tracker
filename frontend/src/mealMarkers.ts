import type { Meal, Question } from "./types";

/** One row marker and what it stands for, as the legend names it. */
export interface Marker { marker: string; label: string }

// The two per-meal flags, worded as the meal form's checkboxes ask them.
export const VEGETABLES_FLAG: Marker = { marker: "🥗", label: "כולל ירקות" };
export const FRUIT_FLAG: Marker = { marker: "🍎", label: "כולל פרי" };

// Row marker per addition id.
const ADDITION_MARKERS: Record<string, string> = { sweet: "🍪", alcohol: "🍷", nuts: "🥜", fat: "🥑" };

// The markers a meal's row carries, flags first, each under the name the questionnaire gives it.
// A history day may carry an addition id a later questionnaire retired; it reads as its raw id,
// like a retired grade choice.
export function mealMarkers(carbsQuestion: Question, meal: Meal): Marker[] {
  const additions = meal.additions.map(({ id }) => {
    const configured = carbsQuestion.additions!.find((a) => a.id === id);
    return { marker: ADDITION_MARKERS[id] ?? id, label: configured === undefined ? id : configured.label };
  });
  return [
    ...(meal.vegetables ? [VEGETABLES_FLAG] : []),
    ...(meal.fruit ? [FRUIT_FLAG] : []),
    ...additions,
  ];
}
