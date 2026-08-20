// Client-side twin of src/common/derive.py for instant dashboard feedback; the server's
// derivation is the authority (floors, submit validation). Both must satisfy
// config/derive-vectors.json.

import type { Derived, Meal } from "./types";

export function deriveDay(meals: Pick<Meal, "at" | "carbs_choice" | "vegetables">[], weights: Record<string, number>): Derived {
  if (meals.length === 0) return { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 };
  const times = meals.map((m) => new Date(m.at).getTime()).sort((a, b) => a - b);
  const carbs = meals.reduce((sum, m) => {
    const weight = weights[m.carbs_choice];
    if (weight === undefined) throw new Error(`unknown carbs choice ${m.carbs_choice}`);
    return sum + weight;
  }, 0);
  return {
    carbs,
    meals: meals.length,
    vegetables: meals.filter((m) => m.vegetables).length,
    eating_window: Math.round((times[times.length - 1] - times[0]) / 3600_000 * 10) / 10,
  };
}
