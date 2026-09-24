import { describe, expect, it } from "vitest";
import { signInCrossedDays } from "./signInBreach";
import type { Day, DayPayload, HistoryResponse, Question, Questionnaire } from "./types";

const question = (id: string): Question =>
  ({ id, type: "single", text: id, choices: [] });

// The bounds the real config draws: the score's, which the reminder reports, and four on other
// answers, which it leaves to the table and the panels.
const questionnaire: Questionnaire = {
  version: 1,
  questions: [{ id: "carbs", type: "points", text: "carbs", max: 30, heavy_meal: 4, choices: [] },
              ...["meals", "eating_window", "drinking", "vegetables"].map(question)],
  rules: [
    { id: "heavy_day", question_id: "carbs", at_least: 12 },
    { id: "too_many_meals", question_id: "meals", at_least: 4 },
    { id: "long_eating_window", question_id: "eating_window", above: 12 },
    { id: "low_drinking", question_id: "drinking", below: 2.5 },
    { id: "no_vegetables", question_id: "vegetables", below: 1 },
  ],
};

const CLEAN_ANSWERS = { carbs: 6, meals: 3, eating_window: 8, drinking: 3, vegetables: 2 };

const open = (date: string, figures: Partial<DayPayload["derived"]> = {}): DayPayload =>
  ({ date, meals: [], derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0, fat: 0, ...figures } });

const closed = (date: string, answers: Record<string, number> = {}): Day =>
  ({ date, answers: { ...CLEAN_ANSWERS, ...answers }, excluded: 0 });

const history = (days: Day[], today: DayPayload, yesterday: DayPayload): HistoryResponse =>
  ({ days, today, yesterday, muted: false, undelivered: [], email_verified: true });

const TODAY = "2026-09-17";
const YESTERDAY = "2026-09-16";

describe("signInCrossedDays", () => {
  it("says nothing when neither day has crossed a bound", () => {
    expect(signInCrossedDays(questionnaire,
      history([closed(YESTERDAY)], open(TODAY), open(YESTERDAY)))).toBeNull();
  });

  it("names yesterday when its closed answers crossed a bound", () => {
    const crossed = signInCrossedDays(questionnaire,
      history([closed(YESTERDAY, { carbs: 14 })], open(TODAY), open(YESTERDAY)));

    expect(crossed).toBe("yesterday");
  });

  it("stays quiet on a closed day whose other answers crossed their bounds", () => {
    // Little water and no vegetables mark their cells red; the reminder reports the score alone.
    expect(signInCrossedDays(questionnaire,
      history([closed(YESTERDAY, { drinking: 1, vegetables: 0 })], open(TODAY), open(YESTERDAY))))
      .toBeNull();
  });

  it("names today off the figures its meals so far derive", () => {
    expect(signInCrossedDays(questionnaire,
      history([closed(YESTERDAY)], open(TODAY, { carbs: 12 }), open(YESTERDAY))))
      .toBe("today");
  });

  it("names a yesterday that was never closed off its own recorded meals", () => {
    expect(signInCrossedDays(questionnaire,
      history([], open(TODAY), open(YESTERDAY, { carbs: 12 }))))
      .toBe("yesterday");
  });

  it("stays quiet on an open day whose meals crossed a bound other than the score's", () => {
    expect(signInCrossedDays(questionnaire,
      history([], open(TODAY, { meals: 4, eating_window: 13, fat: 0 }), open(YESTERDAY))))
      .toBeNull();
  });

  it("names both days together when each crossed a bound", () => {
    expect(signInCrossedDays(questionnaire,
      history([closed(YESTERDAY, { carbs: 14 })], open(TODAY, { carbs: 12 }), open(YESTERDAY))))
      .toBe("both");
  });
});
