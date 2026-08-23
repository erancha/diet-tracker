import { describe, expect, it } from "vitest";
import { domainFor, liveTrendDay, shortForm, ticksFor } from "./trend";
import { fixtureQuestionnaire, trackedDay } from "./test-fixtures";
import type { Question } from "./types";

const drinking = fixtureQuestionnaire.questions[0];
const window_ = fixtureQuestionnaire.questions[1];

describe("shortForm", () => {
  it("shortens an open-ended upper bound", () => {
    expect(shortForm("מעל 12 שעות !!")).toBe("מעל 12");
  });

  it("shortens an open-ended lower bound, keeping the hyphenated prefix", () => {
    expect(shortForm("פחות מ-2.5 ליטר !!")).toBe("פחות מ-2.5");
  });

  it("returns null for a plain quantity label", () => {
    expect(shortForm("3 ליטר")).toBeNull();
  });
});

describe("ticksFor", () => {
  it("picks min, midpoint-nearest, and max choice values with bound-aware labels", () => {
    expect(ticksFor(drinking)).toEqual([
      { value: 2, label: "פחות מ-2.5" },
      { value: 3, label: "3" },
      { value: 4, label: "4" },
    ]);
  });

  it("collapses to two ticks when min and mid coincide", () => {
    expect(ticksFor(window_)).toEqual([
      { value: 8, label: "8" },
      { value: 13, label: "מעל 12" },
    ]);
  });
});

describe("ticksFor points questions", () => {
  it("uses 0, midpoint, and max instead of choice values", () => {
    const carbs: Question = {
      id: "carbs", type: "points", text: "פחמימות", max: 30,
      choices: [{ id: "no_carbs", label: "ללא", value: 0 }],
    };
    expect(ticksFor(carbs).map((t) => t.value)).toEqual([0, 15, 30]);
  });
});

describe("liveTrendDay", () => {
  it("stands in for an unsubmitted day with recorded meals, carrying only the carb score", () => {
    const days = [{ date: "2026-08-19", answers: { carbs: 6 } }];
    expect(liveTrendDay(trackedDay, days)).toEqual({ date: "2026-08-20", answers: { carbs: 4 } });
  });

  it("returns null before the first meal", () => {
    const noMeals = { ...trackedDay, meals: [],
                      derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 } };
    expect(liveTrendDay(noMeals, [])).toBeNull();
  });

  it("returns null once today is already a submitted day", () => {
    const days = [{ date: trackedDay.date, answers: { carbs: 4, drinking: 3 } }];
    expect(liveTrendDay(trackedDay, days)).toBeNull();
  });
});

describe("domainFor", () => {
  it("keeps the choice-value domain for single questions, ignoring plotted data", () => {
    expect(domainFor(drinking, [2, 3, null])).toEqual([1.5, 4.5]);
  });

  it("spans the configured max for a points question even when day totals stay under it", () => {
    const carbs: Question = {
      id: "carbs", type: "points", text: "פחמימות", max: 30,
      choices: [{ id: "no_carbs", label: "ללא", value: 0 }],
    };
    expect(domainFor(carbs, [4, null])).toEqual([-0.5, 30.5]);
  });

  it("extends past the configured max when a day total exceeds it", () => {
    const carbs: Question = {
      id: "carbs", type: "points", text: "פחמימות", max: 8,
      choices: [{ id: "no_carbs", label: "ללא", value: 0 }],
    };
    expect(domainFor(carbs, [15, null])).toEqual([-0.5, 15.5]);
  });
});
