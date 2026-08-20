import { describe, expect, it } from "vitest";
import { isViolating, trendPanels, valueLabel, violates } from "./violations";
import type { Question, Questionnaire, Rule } from "./types";

const carbs: Question = {
  id: "carbs", type: "points", text: "פחמימות", max: 30, panel_title: "ציון פחמימות",
  choices: [
    { id: "no_carbs", label: "ללא פחמימות", value: 0 },
    { id: "grade3", label: "דרגה 3", value: 3 },
  ],
};
const meals: Question = {
  id: "meals", type: "single", text: "ארוחות",
  choices: [{ id: "m2", label: "2 ארוחות", value: 2 }, { id: "m3", label: "3 ארוחות", value: 3 }],
};
const heavy: Rule = { id: "heavy", question_id: "carbs", at_least: 8, consecutive_days: 2, message: "x {days}" };
const few: Rule = { id: "few", question_id: "meals", below: 3, consecutive_days: 2, message: "y {days}" };
const questionnaire: Questionnaire = { version: 3, questions: [carbs, meals], rules: [heavy, few] };

describe("violates", () => {
  it("compares against at_least and below thresholds", () => {
    expect(violates(heavy, 8)).toBe(true);
    expect(violates(heavy, 7.9)).toBe(false);
    expect(violates(few, 2)).toBe(true);
    expect(violates(few, 3)).toBe(false);
  });
});

describe("isViolating", () => {
  it("matches the rules of the given question only", () => {
    expect(isViolating(questionnaire, "carbs", 9)).toBe(true);
    expect(isViolating(questionnaire, "carbs", 2)).toBe(false);
    expect(isViolating(questionnaire, "meals", 2)).toBe(true);
  });
});

describe("valueLabel", () => {
  it("maps exact choice values to labels and passes other numbers through", () => {
    expect(valueLabel(carbs, 3)).toBe("דרגה 3");
    expect(valueLabel(carbs, 17)).toBe("17");
    expect(valueLabel(meals, 2.5)).toBe("2.5");
  });
});

describe("trendPanels", () => {
  it("splits questions by panel_title presence", () => {
    const { panels, strip } = trendPanels(questionnaire);
    expect(panels.map((q) => q.id)).toEqual(["carbs"]);
    expect(strip.map((q) => q.id)).toEqual(["meals"]);
  });
});
