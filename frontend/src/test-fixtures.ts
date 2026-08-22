import type { DayPayload, Questionnaire } from "./types";

// Mirrors the production config's shape: two chartable single questions — one with an
// open-ended bottom bound, one with an open-ended top bound.
export const fixtureQuestionnaire: Questionnaire = {
  version: 1,
  questions: [
    {
      id: "drinking",
      type: "single",
      text: "שתיה",
      panel_title: "שתיה (ליטרים)",
      choices: [
        { id: "low", label: "פחות מ-2.5 ליטר !!", value: 2 },
        { id: "mid", label: "3 ליטר", value: 3 },
        { id: "high", label: "4 ליטר", value: 4 },
      ],
    },
    {
      id: "window",
      type: "single",
      text: "חלון אכילה",
      panel_title: "חלון אכילה (שעות)",
      tooltip: "מהארוחה הראשונה עד האחרונה",
      choices: [
        { id: "h8", label: "8 שעות", value: 8 },
        { id: "over", label: "מעל 12 שעות !!", value: 13 },
      ],
    },
  ],
  rules: [
    { id: "r_drink", question_id: "drinking", below: 2.5, consecutive_days: 2, message: "m1" },
  ],
};

// Questionnaire as the tracker components consume it: a per-meal carbs points question (two
// choices sharing a numeric value, to catch id/value mix-ups) with surcharge additions, plus a
// drinking question for day close. The at_least carbs rule keeps the violation/high-score
// styling interplay under test in the history table.
export const trackerQuestionnaire: Questionnaire = {
  version: 3,
  questions: [
    { id: "drinking", type: "single", text: "שתיה",
      choices: [{ id: "l3", label: "3 ליטר", value: 3 }] },
    { id: "carbs", type: "points", text: "פחמימות", max: 30,
      additions: [{ id: "sweet", label: "כולל מתוק", value: 4 },
                  { id: "alcohol", label: "כולל אלכוהול לא יבש", value: 4 },
                  { id: "nuts", label: "כולל הרבה אגוזים או שקדים", value: 3 }],
      tooltip: "המטרה היא ציון נמוך", day_qualifier: "סיכום ציון", meal_qualifier: "דרגת הארוחה",
      choices: [{ id: "no_carbs", label: "ללא פחמימות", value: 0 },
                { id: "grade4", label: "דרגה 4", value: 4 },
                { id: "grade4b", label: "דרגה 4!", value: 4 }] },
  ],
  rules: [
    { id: "heavy_carbs", question_id: "carbs", at_least: 8, consecutive_days: 2, message: "m" },
  ],
};

// A fully tracked day matching trackerQuestionnaire: two meals with derived values recomputed
// from them.
export const trackedDay: DayPayload = {
  date: "2026-08-20",
  meals: [
    { id: "a", at: "2026-08-20T09:10:00+03:00", carbs_choice: "no_carbs", vegetables: true, fruit: false, additions: [] },
    { id: "b", at: "2026-08-20T13:30:00+03:00", carbs_choice: "grade4", vegetables: false, fruit: true, additions: [] },
  ],
  derived: { carbs: 4, meals: 2, vegetables: 1, eating_window: 4.5 },
};
