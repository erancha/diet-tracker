import { describe, expect, it } from "vitest";
import { domainFor, liveTrendDay, ticksFor, treatDayColumns } from "./trend";
import { fixtureQuestionnaire, trackedDay, trackerQuestionnaire } from "./test-fixtures";
import type { Question, Questionnaire } from "./types";

const drinking = fixtureQuestionnaire.questions[0];
const window_ = fixtureQuestionnaire.questions[1];

const carbs: Question = {
  id: "carbs", type: "points", text: "פחמימות",
  choices: [{ id: "no_carbs", label: "ללא", value: 0 }],
};
const carbsQuestionnaire: Questionnaire = {
  version: 1, questions: [carbs],
  rules: [{ id: "heavy_day", question_id: "carbs", at_least: 12 }],
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
    const days = [{ date: "2026-08-19", answers: { carbs: 6 }, excluded: 0 }];
    expect(liveTrendDay(trackerQuestionnaire, trackedDay, days))
      .toEqual({ date: "2026-08-20", answers: { carbs: 4 }, excluded: 0 });
  });

  it("derives the running day's excluded part from the meals recorded so far", () => {
    // The server sends the subtotal for the days it has stored; the day still being tracked is
    // decomposed in the browser, from the meals the app already holds.
    const day = { ...trackedDay, meals: [
      { ...trackedDay.meals[0], carbs_choice: "carb_grade_7",
        additions: [{ id: "sweet", amount: "regular" }] }] };
    expect(liveTrendDay(trackerQuestionnaire, day, [])!.excluded).toBe(11);
  });

  it("returns null before the first meal", () => {
    const noMeals = { ...trackedDay, meals: [],
                      derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 } };
    expect(liveTrendDay(trackerQuestionnaire, noMeals, [])).toBeNull();
  });

  it("returns null once today is already a submitted day", () => {
    const days = [{ date: trackedDay.date, answers: { carbs: 4, drinking: 3 }, excluded: 0 }];
    expect(liveTrendDay(trackerQuestionnaire, trackedDay, days)).toBeNull();
  });
});

describe("treatDayColumns", () => {
  // 2026-08-14 is a Friday, so a week ending on the Thursday after it holds exactly one.
  const week = ["2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17",
                "2026-08-18", "2026-08-19"];

  it("finds the single column falling on the treat day's weekday", () => {
    expect(treatDayColumns(week, "FRI")).toEqual([1]);
    expect(treatDayColumns(week, "THU")).toEqual([0]);
    expect(treatDayColumns(week, "WED")).toEqual([6]);
  });

  it("finds every such column when the span holds the weekday twice", () => {
    // Eight days from that Friday to the next, both framed.
    expect(treatDayColumns([...week.slice(1), "2026-08-20", "2026-08-21"], "FRI")).toEqual([0, 7]);
  });

  it("rejects a weekday no scheduler token names", () => {
    expect(() => treatDayColumns(week, "FRIDAY")).toThrow(/FRIDAY/);
  });

  it("rejects a span holding no such day rather than leaving the column unframed", () => {
    expect(() => treatDayColumns(week.slice(0, 3), "MON")).toThrow(/MON/);
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
