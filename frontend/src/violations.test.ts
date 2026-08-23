import { describe, expect, it } from "vitest";
import { isViolating, panelTitle, questionTitle, trendPanels, valueLabel, violates } from "./violations";
import type { Question, Questionnaire, Rule } from "./types";

const carbs: Question = {
  id: "carbs", type: "points", text: "פחמימות", max: 30, panel_title: "ציון פחמימות",
  day_qualifier: "סיכום ציון", meal_qualifier: "דרגת הארוחה",
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
  it("maps exact choice values to labels for single-choice questions", () => {
    expect(valueLabel(meals, 3)).toBe("3 ארוחות");
    expect(valueLabel(meals, 2.5)).toBe("2.5");
  });

  it("renders points questions as the score, even when it collides with a choice value", () => {
    expect(valueLabel(carbs, 3)).toBe("3");
    expect(valueLabel(carbs, 17)).toBe("17");
  });
});

describe("questionTitle", () => {
  it("appends the scope's qualifier to the shared base text", () => {
    expect(questionTitle(carbs, "day")).toBe("פחמימות (סיכום ציון)");
    expect(questionTitle(carbs, "meal")).toBe("פחמימות (דרגת הארוחה)");
  });

  it("is the bare text for a question without qualifiers", () => {
    expect(questionTitle(meals, "day")).toBe("ארוחות");
    expect(questionTitle(meals, "meal")).toBe("ארוחות");
  });
});

describe("trendPanels", () => {
  it("splits questions by panel heading presence", () => {
    const { panels, strip } = trendPanels(questionnaire);
    expect(panels.map((q) => q.id)).toEqual(["carbs"]);
    expect(strip.map((q) => q.id)).toEqual(["meals"]);
  });

  it("charts a question whose panel heading is a qualifier on its text", () => {
    const derived: Question = { ...carbs, panel_title: undefined, panel_qualifier: "ציון, נמוך = טוב" };
    const { panels } = trendPanels({ ...questionnaire, questions: [derived, meals] });
    expect(panels.map((q) => q.id)).toEqual(["carbs"]);
  });
});

describe("panelTitle", () => {
  it("uses a standalone panel_title verbatim", () => {
    expect(panelTitle(carbs)).toBe("ציון פחמימות");
  });

  it("derives the title from the question text when only a panel qualifier is declared", () => {
    const derived: Question = { ...carbs, panel_title: undefined, panel_qualifier: "ציון, נמוך = טוב" };
    expect(panelTitle(derived)).toBe("פחמימות (ציון, נמוך = טוב)");
  });
});
