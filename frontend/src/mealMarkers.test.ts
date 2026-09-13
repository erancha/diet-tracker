import { describe, expect, it } from "vitest";
import { mealMarkers } from "./mealMarkers";
import { trackerQuestionnaire } from "./test-fixtures";
import type { Meal } from "./types";

const carbs = trackerQuestionnaire.questions.find((q) => q.id === "carbs")!;
const meal = (fields: Partial<Meal>): Meal => ({
  id: "m", at: "2026-08-20T09:10:00+03:00", carbs_choice: "no_carbs", vegetables: false, fruit: false,
  additions: [], portion: null, second_source: null, ...fields,
});

describe("mealMarkers", () => {
  it("lists the flags a meal carries, then its additions under the questionnaire's labels", () => {
    expect(mealMarkers(carbs, meal({ vegetables: true, fruit: true,
                                     additions: [{ id: "nuts", amount: "regular" }, { id: "fat", amount: "much" }] })))
      .toEqual([
        { marker: "🥗", label: "כולל ירקות" },
        { marker: "🍎", label: "כולל פרי" },
        { marker: "🥜", label: "כולל אגוזים או שקדים" },
        { marker: "🥑", label: "כולל שומן" },
      ]);
  });

  it("lists nothing for a bare meal", () => {
    expect(mealMarkers(carbs, meal({}))).toEqual([]);
  });

  it("reads an addition the questionnaire retired as its raw id, marker and name alike", () => {
    expect(mealMarkers(carbs, meal({ additions: [{ id: "retired", amount: null }] })))
      .toEqual([{ marker: "retired", label: "retired" }]);
  });
});
