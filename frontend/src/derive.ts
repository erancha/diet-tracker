// Client-side twin of src/common/derive.py for instant dashboard feedback; the server's
// derivation is the authority (floors, submit validation). Both must satisfy
// config/derive-vectors.json.

import type { Derived, Meal, Question, ScaleOption } from "./types";

/** The helping-size scale shared by both carb sources, as the derivation applies it: the
 * primary source discounts only from `from_value` up, a heavy second source at any grade. */
export interface Portions {
  from_value: number;
  options: ScaleOption[];
}

/** The scale an addition's amount is recorded on, as the derivation applies it: the configured
 * surcharge prices the routine amount, and every step scales it — past 100% for a heaped one. */
export interface Amounts {
  default: string;
  options: ScaleOption[];
}

/** The second-carb-source contract: primaries up to primary_grade_max may carry one; second
 * grades up to light_grade_max merge into the plate, heavier ones add their grade at one of the
 * shared helpings. */
export interface SecondSourceRule {
  primary_grade_max: number;
  light_grade_max: number;
}

/** What the program excludes from its six non-treat days, as the score decomposition reads it:
 * every carb source graded `grade` or heavier, and the additions `additions` names. */
export interface Excluded {
  grade: number;
  additions: string[];
}

// The carbs question's choices, additions, quantity scales, second-source contract and excluded
// set as the lookups the derivation functions consume.
export function carbsScales(question: Question): {
  weights: Record<string, number>;
  additionValues: Record<string, number>;
  additionAllowances: Record<string, number>;
  amounts: Amounts;
  portions: Portions;
  secondSource: SecondSourceRule;
  excluded: Excluded;
} {
  return {
    weights: Object.fromEntries(question.choices.map((c) => [c.id, c.value])),
    additionValues: Object.fromEntries((question.additions ?? []).map((a) => [a.id, a.value])),
    additionAllowances: Object.fromEntries((question.additions ?? [])
      .filter((a) => a.daily_allowance !== undefined).map((a) => [a.id, a.daily_allowance!])),
    amounts: question.amounts!,
    portions: question.portions!,
    secondSource: question.second_source!,
    excluded: { grade: question.excluded_grade!, additions: question.excluded_additions! },
  };
}

// Whether the helping choice is offered for a grade — the rule the meal form and the derivation
// both read, so the picker appears exactly where it changes the score.
export function portionOffered(portions: Portions, weight: number): boolean {
  return weight >= portions.from_value;
}

// A step's percentage on a quantity scale; an id the scale does not declare is a data fault.
function scalePercent(options: ScaleOption[], optionId: string, kind: string): number {
  const step = options.find((o) => o.id === optionId);
  if (step === undefined) throw new Error(`unknown ${kind} ${optionId}`);
  return step.percent;
}

// What the meal's main carb source weighs: its grade, at its recorded helping where the quantity
// rule offers one. The helping id must resolve against the declared scale even below the offered
// grade — a bad id is a data fault, never a quiet full serving — but it discounts only from the
// threshold up, matching where the picker exists.
function sourceWeight(choice: string, portionId: string | null, weights: Record<string, number>, portions: Portions): number {
  const weight = weights[choice];
  if (weight === undefined) throw new Error(`unknown carbs choice ${choice}`);
  if (portionId !== null) {
    const percent = scalePercent(portions.options, portionId, "portion");
    if (portionOffered(portions, weight)) return (weight * percent) / 100;
  }
  return weight;
}

// Every carbs grade includes one fruit; only the day's first fruit rides free. Each fruit meal
// after it counts as the fruit grade, so its weight is raised to at least that choice's weight —
// never lowered when the meal's own grade is already heavier.
export const FRUIT_ESCALATION_CHOICE = "carb_grade_5";

/** One meal's carb contribution: what it added to the day score, and how much of that came from
 * what the program excludes on its six non-treat days. Every term of `excluded` is also a term of
 * `total`, so the excluded part never exceeds the meal's own weight — the fruit escalation and
 * every permitted grade lift the total alone. */
export interface MealWeight {
  total: number;
  excluded: number;
}

/** One priced step of a meal's carb contribution, in the order the derivation applies them; the
 * points of a meal's terms sum to its weight. The main source is priced at its recorded helping
 * only where the helping rule offers one (`portion` is null otherwise). A light second source
 * merges into the plate (`merged`) and costs only what it lifts the higher grade by; a heavy one
 * is added at its helping. The second fruit's escalation is what it lifts the plate's weight by,
 * and each addition its surcharge at the recorded amount. `excluded` marks a term priced from what
 * the program excludes. */
export type ScoreTerm = (
  | { kind: "source"; choice: string; portion: string | null; points: number }
  | { kind: "second_source"; choice: string; portion: string | null; merged: boolean; points: number }
  | { kind: "fruit_escalation"; points: number }
  | { kind: "addition"; id: string; amount: string | null; points: number }
) & { excluded: boolean };

// Each meal's carb contribution broken into its priced terms, aligned with the input order so
// callers can label the meals they passed in. The fruit escalation reads the day chronologically,
// whatever order the meals arrive in.
export function mealTerms(meals: Pick<Meal, "at" | "carbs_choice" | "fruit" | "additions" | "portion" | "second_source">[], weights: Record<string, number>, additionValues: Record<string, number>, additionAllowances: Record<string, number>, amounts: Amounts, portions: Portions, secondSource: SecondSourceRule, excluded: Excluded): ScoreTerm[][] {
  return mealBreakdown(meals, weights, additionValues, additionAllowances, amounts, portions, secondSource, excluded)
    .map((b) => b.terms);
}

// Each meal's effective carb contribution — its grade weight after fruit escalation, plus its
// additions' surcharges — beside the excluded part of it, aligned with the input order. The totals
// sum to the day's carb score and the excluded parts to what excludedPoints reports, both weighed
// in the one walk mealTerms shares so none of the three can disagree.
export function mealWeights(meals: Pick<Meal, "at" | "carbs_choice" | "fruit" | "additions" | "portion" | "second_source">[], weights: Record<string, number>, additionValues: Record<string, number>, additionAllowances: Record<string, number>, amounts: Amounts, portions: Portions, secondSource: SecondSourceRule, excluded: Excluded): MealWeight[] {
  return mealBreakdown(meals, weights, additionValues, additionAllowances, amounts, portions, secondSource, excluded)
    .map(({ terms, excluded: part }) => ({ total: terms.reduce((sum, t) => sum + t.points, 0), excluded: part }));
}

// Whether a carb grade of this weight is one the program excludes on its six non-treat days.
export function excludesGrade(weight: number, excluded: Excluded): boolean {
  return weight >= excluded.grade;
}

function mealBreakdown(meals: Pick<Meal, "at" | "carbs_choice" | "fruit" | "additions" | "portion" | "second_source">[], weights: Record<string, number>, additionValues: Record<string, number>, additionAllowances: Record<string, number>, amounts: Amounts, portions: Portions, secondSource: SecondSourceRule, excluded: Excluded): { terms: ScoreTerm[]; excluded: number }[] {
  const chronological = meals.map((meal, index) => ({ meal, index }))
    .sort((a, b) => new Date(a.meal.at).getTime() - new Date(b.meal.at).getTime());
  const result = new Array<{ terms: ScoreTerm[]; excluded: number }>(meals.length);
  const excludesSource = (weight: number) => excludesGrade(weight, excluded);
  let fruits = 0;
  const served: Record<string, number> = Object.fromEntries(Object.keys(additionAllowances).map((id) => [id, 0]));
  for (const { meal, index } of chronological) {
    const terms: ScoreTerm[] = [];
    // Quantity applies before the fruit escalation floors the plate's weight: the escalation
    // prices a second fruit, not the helping of whatever else was on the plate, so a reduced
    // helping must not discount it.
    let weight = sourceWeight(meal.carbs_choice, meal.portion, weights, portions);
    const sourceExcluded = excludesSource(weights[meal.carbs_choice]);
    terms.push({ kind: "source", choice: meal.carbs_choice,
                 portion: meal.portion !== null && portionOffered(portions, weights[meal.carbs_choice]) ? meal.portion : null,
                 points: weight, excluded: sourceExcluded });
    let part = sourceExcluded ? weight : 0;
    // A plate drawing on two light carb sources is one method-approved plate, so the higher grade
    // speaks for both. A heavier second source — a slice of white bread beside a grade 2 bowl —
    // always carries a helping from the shared scale, adding its grade at that percentage.
    if (meal.second_source !== null) {
      const secondWeight = weights[meal.second_source.carbs_choice];
      if (secondWeight === undefined) {
        throw new Error(`unknown carbs choice ${meal.second_source.carbs_choice}`);
      }
      if (secondWeight <= secondSource.light_grade_max) {
        const lifted = Math.max(weight, secondWeight);
        terms.push({ kind: "second_source", choice: meal.second_source.carbs_choice, portion: null,
                     merged: true, points: lifted - weight, excluded: excludesSource(secondWeight) });
        weight = lifted;
        if (excludesSource(secondWeight)) part = Math.max(part, secondWeight);
      } else {
        const added = (secondWeight * scalePercent(portions.options, meal.second_source.portion!, "portion")) / 100;
        terms.push({ kind: "second_source", choice: meal.second_source.carbs_choice,
                     portion: meal.second_source.portion, merged: false, points: added,
                     excluded: excludesSource(secondWeight) });
        weight += added;
        if (excludesSource(secondWeight)) part += added;
      }
    }
    if (meal.fruit) {
      fruits += 1;
      if (fruits > 1) {
        const escalation = weights[FRUIT_ESCALATION_CHOICE];
        if (escalation === undefined) throw new Error(`unknown carbs choice ${FRUIT_ESCALATION_CHOICE}`);
        const lifted = Math.max(weight, escalation);
        terms.push({ kind: "fruit_escalation", points: lifted - weight, excluded: false });
        weight = lifted;
      }
    }
    // Additions (a sweet, a drink) cost on top of the meal's sources (escalated or not), so an
    // excellent meal with a cookie stays cheaper than a heavy meal with one. Each costs its
    // surcharge per routine serving — one serving when the record carries no amount. An
    // addition with a daily allowance pays only for the servings past it, counted in meal order.
    for (const addition of meal.additions) {
      const value = additionValues[addition.id];
      if (value === undefined) throw new Error(`unknown addition ${addition.id}`);
      const servings = addition.amount === null
        ? 1
        : scalePercent(amounts.options, addition.amount, "amount") / 100;
      let charged = servings;
      if (addition.id in additionAllowances) {
        const allowance = additionAllowances[addition.id];
        const before = served[addition.id];
        served[addition.id] = before + servings;
        charged = Math.max(0, before + servings - allowance) - Math.max(0, before - allowance);
      }
      const surcharge = value * charged;
      const additionExcluded = excluded.additions.includes(addition.id);
      terms.push({ kind: "addition", id: addition.id, amount: addition.amount, points: surcharge,
                   excluded: additionExcluded });
      weight += surcharge;
      if (additionExcluded) part += surcharge;
    }
    result[index] = { terms, excluded: part };
  }
  return result;
}

// The part of the day's carb score that came from what the program excludes on its six non-treat
// days. Charted beside the score, it separates a day that stayed within the program from one that
// spent the same points on sugar and flour.
export function excludedPoints(meals: Pick<Meal, "at" | "carbs_choice" | "fruit" | "additions" | "portion" | "second_source">[], weights: Record<string, number>, additionValues: Record<string, number>, additionAllowances: Record<string, number>, amounts: Amounts, portions: Portions, secondSource: SecondSourceRule, excluded: Excluded): number {
  return mealWeights(meals, weights, additionValues, additionAllowances, amounts, portions, secondSource, excluded)
    .reduce((sum, w) => sum + w.excluded, 0);
}

export function deriveDay(meals: Pick<Meal, "at" | "carbs_choice" | "vegetables" | "fruit" | "fat_servings" | "additions" | "portion" | "second_source">[], weights: Record<string, number>, additionValues: Record<string, number>, additionAllowances: Record<string, number>, amounts: Amounts, portions: Portions, secondSource: SecondSourceRule, excluded: Excluded): Derived {
  if (meals.length === 0) return { carbs: 0, meals: 0, vegetables: 0, eating_window: 0, fat: 0 };
  const ordered = [...meals].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const window = new Date(ordered[ordered.length - 1].at).getTime() - new Date(ordered[0].at).getTime();
  return {
    carbs: mealWeights(meals, weights, additionValues, additionAllowances, amounts, portions, secondSource, excluded).reduce((sum, w) => sum + w.total, 0),
    meals: meals.length,
    vegetables: meals.filter((m) => m.vegetables).length,
    // Whole hours, rounded up like the server: the window never understates itself, so the
    // floor a submission must meet is the conservative bound of the recorded span.
    eating_window: Math.ceil(window / 3600_000),
    fat: meals.reduce((sum, m) => sum + m.fat_servings, 0),
  };
}
