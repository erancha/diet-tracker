// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveDay, mealWeights } from "./derive";

// The same vectors pin src/common/derive.py — reading the file keeps one fixture for both
// runtimes without import-path acrobatics.
const fixture = JSON.parse(
  readFileSync(new URL("../../config/derive-vectors.json", import.meta.url), "utf-8"));

describe("deriveDay", () => {
  for (const vector of fixture.vectors) {
    it(vector.name, () => {
      expect(deriveDay(vector.meals, fixture.weights, fixture.addition_values, fixture.small_portion)).toEqual(vector.derived);
    });
  }
});

describe("mealWeights", () => {
  for (const vector of fixture.vectors) {
    it(`sums to the day's carb score — ${vector.name}`, () => {
      const perMeal = mealWeights(vector.meals, fixture.weights, fixture.addition_values, fixture.small_portion);
      expect(perMeal.reduce((sum, w) => sum + w, 0)).toBe(vector.derived.carbs);
    });
  }

  it("aligns results with the input order, not chronological order", () => {
    const meals = [
      { at: "2026-08-20T20:00:00+03:00", carbs_choice: "carb_grade_6", vegetables: false, fruit: false, additions: [], small_portion: false },
      { at: "2026-08-20T08:00:00+03:00", carbs_choice: "no_carbs", vegetables: false, fruit: false, additions: [], small_portion: false },
    ];
    expect(mealWeights(meals, fixture.weights, fixture.addition_values, fixture.small_portion)).toEqual([6, 0]);
  });

  it("escalates the chronologically later fruit meal even when listed first", () => {
    const meals = [
      { at: "2026-08-20T13:00:00+03:00", carbs_choice: "carb_grade_1", vegetables: false, fruit: true, additions: [], small_portion: false },
      { at: "2026-08-20T09:00:00+03:00", carbs_choice: "carb_grade_1", vegetables: false, fruit: true, additions: [], small_portion: false },
    ];
    expect(mealWeights(meals, fixture.weights, fixture.addition_values, fixture.small_portion)).toEqual([5, 1]);
  });
});
