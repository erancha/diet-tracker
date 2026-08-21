// Client-side twin of src/common/derive.py for instant dashboard feedback; the server's
// derivation is the authority (floors, submit validation). Both must satisfy
// config/derive-vectors.json.

import type { Derived, Meal } from "./types";

// Every carbs grade includes one fruit; only the day's first fruit rides free. Each fruit meal
// after it counts as grade 5 ("more than one fruit"), so its weight is raised to at least this
// choice's weight — never lowered when the meal's own grade is already heavier.
const FRUIT_ESCALATION_CHOICE = "grade5";

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

export function deriveDay(meals: Pick<Meal, "at" | "carbs_choice" | "vegetables" | "fruit">[], weights: Record<string, number>): Derived {
  if (meals.length === 0) return { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 };
  const ordered = [...meals].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  let carbs = 0;
  let fruits = 0;
  for (const meal of ordered) {
    let weight = weights[meal.carbs_choice];
    if (weight === undefined) throw new Error(`unknown carbs choice ${meal.carbs_choice}`);
    if (meal.fruit) {
      fruits += 1;
      if (fruits > 1) {
        const escalation = weights[FRUIT_ESCALATION_CHOICE];
        if (escalation === undefined) throw new Error(`unknown carbs choice ${FRUIT_ESCALATION_CHOICE}`);
        weight = Math.max(weight, escalation);
      }
    }
    carbs += weight;
  }
  const window = new Date(ordered[ordered.length - 1].at).getTime() - new Date(ordered[0].at).getTime();
  return {
    carbs,
    meals: meals.length,
    vegetables: meals.filter((m) => m.vegetables).length,
    eating_window: roundToHalfHour(window / 3600_000),
  };
}
