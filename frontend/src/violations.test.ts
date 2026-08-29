import { describe, expect, it } from "vitest";
import { activeViolations, isHeavyMeal, isViolating, panelTitle, questionTitle, trendPanels, valueLabel, violates } from "./violations";
import type { Day, Question, Questionnaire, Rule } from "./types";

const carbs: Question = {
  id: "carbs", type: "points", text: "פחמימות", max: 30, heavy_meal: 4, panel_title: "ציון פחמימות",
  day_qualifier: "סיכום ציון", meal_qualifier: "דרגת הארוחה",
  choices: [
    { id: "no_carbs", label: "ללא פחמימות", value: 0 },
    { id: "carb_grade_3", label: "דרגה 3", value: 3 },
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

describe("isHeavyMeal", () => {
  it("judges the plate's whole cost against the configured bound", () => {
    expect(isHeavyMeal(carbs, 4)).toBe(true);
    expect(isHeavyMeal(carbs, 3.9)).toBe(false);
    // The cost a caller passes already carries the additions and the halved small portion, so a
    // light grade beside a drink is heavy while a small helping of a steep grade is not.
    expect(isHeavyMeal(carbs, 2 + 4)).toBe(true);
    expect(isHeavyMeal(carbs, 7 / 2)).toBe(false);
  });
});

describe("activeViolations", () => {
  const today = "2026-08-23";
  const yesterday = "2026-08-22";
  // Newest first, matching the API's day ordering.
  const history = (entries: Array<[string, Record<string, number>]>): Day[] =>
    entries.map(([date, answers]) => ({ date, answers }));

  it("reports every rule whose violating streak at the newest day reaches its required length", () => {
    const days = history([
      [today, { carbs: 9, meals: 2 }],
      [yesterday, { carbs: 8, meals: 2 }],
    ]);
    expect(activeViolations(questionnaire, days, today, yesterday)).toEqual(["x 2", "y 2"]);
  });

  it("formats {value} with the rule threshold and {days} with the actual streak length", () => {
    const valued: Questionnaire = {
      ...questionnaire,
      rules: [{ id: "heavy", question_id: "carbs", at_least: 8, consecutive_days: 2,
                message: "ציון {value} ומעלה {days} ימים" }],
    };
    const days = history([
      [today, { carbs: 9 }],
      [yesterday, { carbs: 10 }],
      ["2026-08-21", { carbs: 8 }],
    ]);
    expect(activeViolations(valued, days, today, yesterday)).toEqual(["ציון 8 ומעלה 3 ימים"]);
  });

  it("does not report a streak shorter than the rule's required length", () => {
    const days = history([[today, { carbs: 9, meals: 3 }]]);
    expect(activeViolations(questionnaire, days, today, yesterday)).toEqual([]);
  });

  it("does not report past violations once the newest day is clean", () => {
    const days = history([
      [today, { carbs: 0, meals: 3 }],
      [yesterday, { carbs: 9, meals: 3 }],
      ["2026-08-21", { carbs: 9, meals: 3 }],
    ]);
    expect(activeViolations(questionnaire, days, today, yesterday)).toEqual([]);
  });

  it("ends the streak at a calendar gap", () => {
    const days = history([
      [today, { carbs: 9, meals: 3 }],
      ["2026-08-21", { carbs: 9, meals: 3 }],
    ]);
    expect(activeViolations(questionnaire, days, today, yesterday)).toEqual([]);
  });

  it("ends the streak at a day missing the rule's question", () => {
    const days = history([
      [today, { carbs: 9, meals: 3 }],
      [yesterday, { meals: 3 }],
    ]);
    expect(activeViolations(questionnaire, days, today, yesterday)).toEqual([]);
  });

  it("evaluates as of yesterday while today is not yet submitted", () => {
    const days = history([
      [yesterday, { carbs: 9, meals: 3 }],
      ["2026-08-21", { carbs: 9, meals: 3 }],
    ]);
    expect(activeViolations(questionnaire, days, today, yesterday)).toEqual(["x 2"]);
  });

  it("reports nothing when the newest day is older than yesterday", () => {
    const days = history([
      ["2026-08-21", { carbs: 9, meals: 3 }],
      ["2026-08-20", { carbs: 9, meals: 3 }],
    ]);
    expect(activeViolations(questionnaire, days, today, yesterday)).toEqual([]);
  });

  it("reports nothing for an empty history", () => {
    expect(activeViolations(questionnaire, [], today, yesterday)).toEqual([]);
  });
});

describe("valueLabel", () => {
  it("maps exact choice values to labels for single-choice questions", () => {
    expect(valueLabel(meals, 3)).toBe("3 ארוחות");
    expect(valueLabel(meals, 2.5)).toBe("2.5");
  });

  it("carries the unit on a derived value no choice names", () => {
    // A window the meal log computed between the choices, and one past the whole ladder: both
    // would otherwise read as bare numbers beside labelled values in the same column.
    const window: Question = { ...meals, id: "eating_window", unit: "שעות",
                               choices: [{ id: "h8", label: "8 שעות", value: 8 }] };
    expect(valueLabel(window, 8)).toBe("8 שעות");
    expect(valueLabel(window, 7.5)).toBe("7.5 שעות");
    expect(valueLabel(window, 13.5)).toBe("13.5 שעות");
  });

  it("leaves a unitless question's unmatched value as the bare number", () => {
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

  it("orders points panels before single-type panels regardless of config order", () => {
    const drinking: Question = {
      id: "drinking", type: "single", text: "שתיה", panel_title: "שתיה (ליטרים)",
      choices: [{ id: "l3", label: "3 ליטר", value: 3 }],
    };
    const { panels } = trendPanels({ ...questionnaire, questions: [drinking, carbs, meals] });
    expect(panels.map((q) => q.id)).toEqual(["carbs", "drinking"]);
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
