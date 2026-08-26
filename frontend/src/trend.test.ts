import { describe, expect, it } from "vitest";
import { domainFor, liveTrendDay, ticksFor } from "./trend";
import { fixtureQuestionnaire, trackedDay } from "./test-fixtures";
import type { Question } from "./types";

const drinking = fixtureQuestionnaire.questions[0];
const window_ = fixtureQuestionnaire.questions[1];

describe("ticksFor", () => {
  it("picks the lowest, midpoint-nearest, and highest measured choice values", () => {
    const hourLadder: Question = {
      id: "window", type: "single", text: "חלון אכילה",
      choices: [8, 9, 10, 11, 12].map((h) => ({ id: `h${h}`, label: `${h} שעות`, value: h })),
    };
    expect(ticksFor(hourLadder)).toEqual([8, 10, 12]);
  });

  it("leaves out an open-ended bound so no gridline lands on its sentinel value", () => {
    expect(ticksFor(drinking)).toEqual([3, 4]);
  });

  it("collapses to a single tick when only one measured choice remains", () => {
    expect(ticksFor(window_)).toEqual([8]);
  });
});

describe("ticksFor points questions", () => {
  it("uses 0, midpoint, and max instead of choice values", () => {
    const carbs: Question = {
      id: "carbs", type: "points", text: "פחמימות", max: 30,
      choices: [{ id: "no_carbs", label: "ללא", value: 0 }],
    };
    expect(ticksFor(carbs)).toEqual([0, 15, 30]);
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
