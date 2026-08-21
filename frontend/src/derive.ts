// Client-side twin of src/common/derive.py for instant dashboard feedback; the server's
// derivation is the authority (floors, submit validation). Both must satisfy
// config/derive-vectors.json.

import type { Derived, Meal } from "./types";

// The eating window is reported in half hours and must round exactly like the server code,
// which is the authority: Python's round() sends a window landing exactly between two half
// hours (a span ending in .25 or .75) to the nearest even half-hour count, not always upward
// the way Math.round would. Everything else goes to the nearest half hour.
function roundToHalfHour(hours: number): number {
  const halves = hours * 2;
  const whole = Math.floor(halves);
  if (halves - whole > 0.5) return (whole + 1) / 2;
  if (halves - whole < 0.5) return whole / 2;
  return (whole % 2 === 0 ? whole : whole + 1) / 2;
}

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
    eating_window: roundToHalfHour((times[times.length - 1] - times[0]) / 3600_000),
  };
}
