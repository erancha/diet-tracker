import { describe, expect, it } from "vitest";
import { isFirstVisit } from "./firstVisit";
import type { DayPayload, HistoryResponse, Meal, WeightPayload } from "./types";

const emptyDay = (date: string): DayPayload => ({
  date,
  meals: [],
  derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 },
});

const meal: Meal = {
  id: "m1", at: "2026-08-28T09:00:00", carbs_choice: "c", vegetables: true, fruit: false,
  additions: [], portion: null, second_source: null,
};

const EMPTY_HISTORY: HistoryResponse = {
  days: [],
  today: emptyDay("2026-08-28"),
  yesterday: emptyDay("2026-08-27"),
  muted: false,
};
const EMPTY_WEIGHT: WeightPayload = { target: null, entries: [] };

describe("isFirstVisit", () => {
  it("holds for an account that has recorded nothing at all", () => {
    expect(isFirstVisit(EMPTY_HISTORY, EMPTY_WEIGHT)).toBe(true);
  });

  it("fails on a submitted day", () => {
    const history = { ...EMPTY_HISTORY, days: [{ date: "2026-08-20", answers: {} }] };
    expect(isFirstVisit(history, EMPTY_WEIGHT)).toBe(false);
  });

  it("fails on a meal logged today, before any day was submitted", () => {
    const history = { ...EMPTY_HISTORY, today: { ...EMPTY_HISTORY.today, meals: [meal] } };
    expect(isFirstVisit(history, EMPTY_WEIGHT)).toBe(false);
  });

  it("fails on a meal logged yesterday, before any day was submitted", () => {
    const history = { ...EMPTY_HISTORY, yesterday: { ...EMPTY_HISTORY.yesterday, meals: [meal] } };
    expect(isFirstVisit(history, EMPTY_WEIGHT)).toBe(false);
  });

  it("fails on a weighing", () => {
    expect(isFirstVisit(EMPTY_HISTORY, { target: null, entries: [{ date: "2026-08-27", kg: 80, at: null }] }))
      .toBe(false);
  });

  it("fails on a target set before the first weighing", () => {
    expect(isFirstVisit(EMPTY_HISTORY, { target: 75, entries: [] })).toBe(false);
  });
});
