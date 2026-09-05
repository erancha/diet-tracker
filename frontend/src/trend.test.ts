import { describe, expect, it } from "vitest";
import { domainFor, liveTrendDay, ticksFor } from "./trend";
import { fixtureQuestionnaire, trackedDay } from "./test-fixtures";
import type { Question, Questionnaire } from "./types";

const drinking = fixtureQuestionnaire.questions[0];
const window_ = fixtureQuestionnaire.questions[1];

const carbs: Question = {
  id: "carbs", type: "points", text: "פחמימות",
  choices: [{ id: "no_carbs", label: "ללא", value: 0 }],
};
const carbsQuestionnaire: Questionnaire = {
  version: 1, questions: [carbs],
  rules: [{ id: "heavy_day", question_id: "carbs", at_least: 12,
            consecutive_days: 2, message: "m {days}" }],
};

describe("ticksFor", () => {
  it("picks the lowest, midpoint-nearest, and highest measured choice values", () => {
    const hourLadder: Question = {
      id: "window", type: "single", text: "חלון אכילה",
      choices: [8, 9, 10, 11, 12].map((h) => ({ id: `h${h}`, label: `${h} שעות`, value: h })),
    };
    expect(ticksFor(fixtureQuestionnaire, hourLadder)).toEqual([8, 10, 12]);
  });

  it("leaves out an open-ended bound so no gridline lands on its sentinel value", () => {
    expect(ticksFor(fixtureQuestionnaire, drinking)).toEqual([3, 4]);
  });

  it("collapses to a single tick when only one measured choice remains", () => {
    expect(ticksFor(fixtureQuestionnaire, window_)).toEqual([8]);
  });
});

describe("ticksFor points questions", () => {
  it("grids at the heavy-day limit and its next two multiples", () => {
    expect(ticksFor(carbsQuestionnaire, carbs)).toEqual([12, 24, 36]);
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
  it("spans the gridlines alone when every day plots between them", () => {
    const [low, high] = domainFor(fixtureQuestionnaire, drinking, [3, 4, null]);
    expect(low).toBeCloseTo(2.92);
    expect(high).toBeCloseTo(4.08);
  });

  it("reaches past a gridline for a day plotted beyond it", () => {
    const [low, high] = domainFor(fixtureQuestionnaire, drinking, [2, 3, null]);
    expect(low).toBeCloseTo(1.84);
    expect(high).toBeCloseTo(4.16);
  });

  it("spans three heavy-day limits for a points question even when day totals stay under", () => {
    expect(domainFor(carbsQuestionnaire, carbs, [4, null])).toEqual([-0.5, 36.5]);
  });

  it("extends past the top gridline when a day total exceeds it", () => {
    expect(domainFor(carbsQuestionnaire, carbs, [40, null])).toEqual([-0.5, 40.5]);
  });
});
