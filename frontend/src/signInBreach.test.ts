import { describe, expect, it } from "vitest";
import { signInBreachReminder } from "./signInBreach";
import type { Day, DayPayload, HistoryResponse, Question, Questionnaire } from "./types";

const question = (id: string): Question =>
  ({ id, type: "single", text: id, choices: [] });

// The bounds the real config draws, in both directions: three a day grows into and two it stands
// under until the eating and drinking that answer them have happened.
const questionnaire: Questionnaire = {
  version: 1,
  questions: ["carbs", "meals", "eating_window", "drinking", "vegetables"].map(question),
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
  ({ date, meals: [], derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0, ...figures } });

const closed = (date: string, answers: Record<string, number> = {}): Day =>
  ({ date, answers: { ...CLEAN_ANSWERS, ...answers }, excluded: 0 });

const history = (days: Day[], today: DayPayload, yesterday: DayPayload): HistoryResponse =>
  ({ days, today, yesterday, muted: false, undelivered: [], email_verified: true });

const TODAY = "2026-09-17";
const YESTERDAY = "2026-09-16";

describe("signInBreachReminder", () => {
  it("says nothing when neither day has crossed a bound", () => {
    expect(signInBreachReminder(questionnaire,
      history([closed(YESTERDAY)], open(TODAY), open(YESTERDAY)))).toBeNull();
  });

  it("stays quiet on a morning that has recorded nothing yet", () => {
    // Nothing eaten or drunk stands under both shortfall bounds, which a closed day would be
    // judged against — the reminder must not read that as today having crossed one.
    expect(signInBreachReminder(questionnaire,
      history([], open(TODAY), open(YESTERDAY)))).toBeNull();
  });

  it("names yesterday when its closed answers crossed a bound", () => {
    const reminder = signInBreachReminder(questionnaire,
      history([closed(YESTERDAY, { carbs: 14 })], open(TODAY), open(YESTERDAY)));

    expect(reminder).toBe("אתמול חצה סף (מסומן באדום בגרפי המגמות ובטבלה)");
  });

  it("names yesterday for a shortfall only its closed answers can settle", () => {
    expect(signInBreachReminder(questionnaire,
      history([closed(YESTERDAY, { drinking: 1 })], open(TODAY), open(YESTERDAY))))
      .toBe("אתמול חצה סף (מסומן באדום בגרפי המגמות ובטבלה)");
  });

  it("names today off the figures its meals so far derive", () => {
    expect(signInBreachReminder(questionnaire,
      history([closed(YESTERDAY)], open(TODAY, { carbs: 12 }), open(YESTERDAY))))
      .toBe("היום חצה סף (מסומן באדום בגרפי המגמות ובטבלה)");
  });

  it("names a yesterday that was never closed off its own recorded meals", () => {
    expect(signInBreachReminder(questionnaire,
      history([], open(TODAY), open(YESTERDAY, { meals: 4 }))))
      .toBe("אתמול חצה סף (מסומן באדום בגרפי המגמות ובטבלה)");
  });

  it("names both days together when each crossed a bound", () => {
    expect(signInBreachReminder(questionnaire,
      history([closed(YESTERDAY, { carbs: 14 })], open(TODAY, { eating_window: 13 }),
              open(YESTERDAY))))
      .toBe("אתמול והיום חצו סף (מסומן באדום בגרפי המגמות ובטבלה)");
  });
});
