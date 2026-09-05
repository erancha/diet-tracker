// Client-side twin of src/common/derive.py for instant dashboard feedback; the server's
// derivation is the authority (floors, submit validation). Both must satisfy
// config/derive-vectors.json.

import type { Derived, Meal, PortionOption, Question } from "./types";

/** The helping-size scale shared by both carb sources, as the derivation applies it: the
 * primary source discounts only from `from_value` up, a heavy second source at any grade. */
export interface Portions {
  from_value: number;
  options: PortionOption[];
}

/** The second-carb-source contract, as the derivation prices it: grades up to light_grade_max
 * merge into the plate, heavier ones add their grade at one of the shared helpings. */
export interface SecondSourceRule {
  light_grade_max: number;
}

// The carbs question's choices, additions, helping scale and second-source contract as the
// lookups the derivation functions consume.
export function carbsScales(question: Question): {
  weights: Record<string, number>;
  additionValues: Record<string, number>;
  portions: Portions;
  secondSource: SecondSourceRule;
} {
  return {
    weights: Object.fromEntries(question.choices.map((c) => [c.id, c.value])),
    additionValues: Object.fromEntries((question.additions ?? []).map((a) => [a.id, a.value])),
    portions: question.portions!,
    secondSource: question.second_source!,
  };
}

// Whether the helping choice is offered for a grade — the rule the meal form and the derivation
// both read, so the picker appears exactly where it changes the score.
export function portionOffered(portions: Portions, weight: number): boolean {
  return weight >= portions.from_value;
}

// A helping's percentage on the shared scale; an id the scale does not declare is a data fault.
function portionPercent(portions: Portions, portionId: string): number {
  const helping = portions.options.find((p) => p.id === portionId);
  if (helping === undefined) throw new Error(`unknown portion ${portionId}`);
  return helping.percent;
}

// What the meal's main carb source weighs: its grade, at its recorded helping where the quantity
// rule offers one. The helping id must resolve against the declared scale even below the offered
// grade — a bad id is a data fault, never a quiet full serving — but it discounts only from the
// threshold up, matching where the picker exists.
function sourceWeight(choice: string, portionId: string | null, weights: Record<string, number>, portions: Portions): number {
  const weight = weights[choice];
  if (weight === undefined) throw new Error(`unknown carbs choice ${choice}`);
  if (portionId !== null) {
    const percent = portionPercent(portions, portionId);
    if (portionOffered(portions, weight)) return (weight * percent) / 100;
  }
  return weight;
}

// Every carbs grade includes one fruit; only the day's first fruit rides free. Each fruit meal
// after it counts as the fruit grade, so its weight is raised to at least that choice's weight —
// never lowered when the meal's own grade is already heavier.
const FRUIT_ESCALATION_CHOICE = "carb_grade_5";

// Each meal's effective carb contribution — its grade weight after fruit escalation, plus its
// additions' surcharges — aligned with the input order so callers can label the meals they
// passed in. The returned weights sum to the day's carb score.
export function mealWeights(meals: Pick<Meal, "at" | "carbs_choice" | "fruit" | "additions" | "portion" | "second_source">[], weights: Record<string, number>, additionValues: Record<string, number>, portions: Portions, secondSource: SecondSourceRule): number[] {
  const chronological = meals.map((meal, index) => ({ meal, index }))
    .sort((a, b) => new Date(a.meal.at).getTime() - new Date(b.meal.at).getTime());
  const result = new Array<number>(meals.length);
  let fruits = 0;
  for (const { meal, index } of chronological) {
    // Quantity applies before the fruit escalation floors the plate's weight: the escalation
    // prices a second fruit, not the helping of whatever else was on the plate, so a reduced
    // helping must not discount it.
    let weight = sourceWeight(meal.carbs_choice, meal.portion, weights, portions);
    // A plate drawing on two light carb sources is one method-approved plate, so the higher grade
    // speaks for both. A heavier second source — a slice of white bread beside a grade 2 bowl —
    // always carries a helping from the shared scale, adding its grade at that percentage.
    if (meal.second_source !== null) {
      const secondWeight = weights[meal.second_source.carbs_choice];
      if (secondWeight === undefined) {
        throw new Error(`unknown carbs choice ${meal.second_source.carbs_choice}`);
      }
      if (secondWeight <= secondSource.light_grade_max) {
        weight = Math.max(weight, secondWeight);
      } else {
        weight += (secondWeight * portionPercent(portions, meal.second_source.portion!)) / 100;
      }
    }
    if (meal.fruit) {
      fruits += 1;
      if (fruits > 1) {
        const escalation = weights[FRUIT_ESCALATION_CHOICE];
        if (escalation === undefined) throw new Error(`unknown carbs choice ${FRUIT_ESCALATION_CHOICE}`);
        weight = Math.max(weight, escalation);
      }
    }
    // Additions (a sweet, alcohol, too many nuts) cost on top of the meal's sources (escalated
    // or not), so an excellent meal with a cookie stays cheaper than a heavy meal with one.
    for (const addition of meal.additions) {
      const value = additionValues[addition];
      if (value === undefined) throw new Error(`unknown addition ${addition}`);
      weight += value;
    }
    result[index] = weight;
  }
  return result;
}

export function deriveDay(meals: Pick<Meal, "at" | "carbs_choice" | "vegetables" | "fruit" | "additions" | "portion" | "second_source">[], weights: Record<string, number>, additionValues: Record<string, number>, portions: Portions, secondSource: SecondSourceRule): Derived {
  if (meals.length === 0) return { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 };
  const ordered = [...meals].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const window = new Date(ordered[ordered.length - 1].at).getTime() - new Date(ordered[0].at).getTime();
  return {
    carbs: mealWeights(meals, weights, additionValues, portions, secondSource).reduce((sum, w) => sum + w, 0),
    meals: meals.length,
    vegetables: meals.filter((m) => m.vegetables).length,
    // Whole hours, rounded up like the server: the window never understates itself, so the
    // floor a submission must meet is the conservative bound of the recorded span.
    eating_window: Math.ceil(window / 3600_000),
  };
}
