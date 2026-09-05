import { screen } from "@testing-library/react";
import type { DayPayload, Questionnaire } from "./types";

// The dashboard keeps each figure's value in its own element so color lands on the number alone,
// and getByText matches an element's own text nodes only — so a figure is reachable by its label
// and read back whole through toHaveTextContent.
export function dashboardFigure(label: string): HTMLElement {
  return screen.getByText(new RegExp(`${label}:`));
}

// Mirrors the production config's shape: two chartable single questions — one with an
// open-ended bottom bound, one with an open-ended top bound.
export const fixtureQuestionnaire: Questionnaire = {
  version: 1,
  questions: [
    {
      id: "drinking",
      type: "single",
      text: "שתיה",
      unit: "ליטר",
      // Above the rule's bound, so the middle choice exercises the warn-floor styling alone
      // while the bottom one still carries the full violation. The norm sits between the
      // choices, so values off it in either direction exercise the off-norm bolding.
      warn_below: 4,
      norm: 3,
      panel_title: "שתיה (ליטרים)",
      choices: [
        { id: "low", label: "פחות מ-2.5 ליטר !!", value: 2, bound: true },
        { id: "mid", label: "3 ליטר", value: 3 },
        { id: "high", label: "4 ליטר", value: 4 },
      ],
    },
    {
      id: "window",
      type: "single",
      text: "חלון אכילה",
      unit: "שעות",
      panel_title: "חלון אכילה (שעות)",
      tooltip: "מהארוחה הראשונה עד האחרונה",
      choices: [
        { id: "h8", label: "8 שעות", value: 8 },
        { id: "over", label: "מעל 12 שעות !!", value: 13, bound: true },
      ],
    },
  ],
  rules: [
    { id: "r_drink", question_id: "drinking", below: 2.5, consecutive_days: 2, message: "m1" },
  ],
};

// Questionnaire as the tracker components consume it: a per-meal carbs points question (two
// choices sharing a numeric value, to catch id/value mix-ups; one grade either side of the
// portion threshold) with the surcharge additions and the shared helping scale, plus a drinking
// question for day close. The at_least carbs rule keeps the violation/heavy-day styling
// interplay under test in the history table, and heavy_meal is the per-meal bound: grade 4
// reaches it on its own, and a lighter grade reaches it once additions are priced in. The
// meals rule sets the ceiling the tracker's add-meal warning reads: with one meal fewer than
// its at_least already recorded, adding another would violate it.
export const trackerQuestionnaire: Questionnaire = {
  version: 3,
  questions: [
    { id: "drinking", type: "single", text: "שתיה",
      choices: [{ id: "l3", label: "3 ליטר", value: 3 }] },
    { id: "carbs", type: "points", text: "פחמימות", max: 30, heavy_meal: 4,
      additions: [{ id: "sweet", label: "כולל מתוק", value: 4 },
                  { id: "alcohol", label: "כולל אלכוהול לא יבש", value: 4 },
                  { id: "nuts", label: "כולל הרבה אגוזים או שקדים", value: 3 },
                  { id: "fat", label: "כולל הרבה שומן", value: 2 }],
      tooltip: "המטרה היא ציון נמוך", day_qualifier: "סיכום ציון", meal_qualifier: "דרגת הארוחה",
      portions: { from_value: 5,
                  options: [{ id: "small", label: "מנה קטנה", percent: 60 },
                            { id: "medium", label: "מנה בינונית", percent: 80 },
                            { id: "full", label: "מנה רגילה", percent: 100 }] },
      second_source: { light_grade_max: 2 },
      // Grades with and without an examples list, so the label-density switch is exercised over
      // both kinds at once; carb_grade_2 is the light grade the second-source contract admits.
      choices: [{ id: "no_carbs", label: "ללא פחמימות", value: 0 },
                { id: "carb_grade_2", label: "דרגה 2", examples: "קינואה", value: 2 },
                { id: "carb_grade_4", label: "דרגה 4", examples: "אורז לבן", value: 4 },
                { id: "grade4b", label: "דרגה 4!", value: 4 },
                { id: "carb_grade_7", label: "דרגה 7", examples: "קמח לבן", value: 7 }] },
  ],
  rules: [
    { id: "heavy_day", question_id: "carbs", at_least: 8, consecutive_days: 2, message: "m" },
    { id: "many_meals", question_id: "meals", at_least: 4, consecutive_days: 2, message: "m2" },
  ],
};

// A fully tracked day matching trackerQuestionnaire: two meals with derived values recomputed
// from them.
export const trackedDay: DayPayload = {
  date: "2026-08-20",
  meals: [
    { id: "a", at: "2026-08-20T09:10:00+03:00", carbs_choice: "no_carbs", vegetables: true, fruit: false, additions: [], portion: null, second_source: null },
    { id: "b", at: "2026-08-20T13:30:00+03:00", carbs_choice: "carb_grade_4", vegetables: false, fruit: true, additions: [], portion: null, second_source: null },
  ],
  derived: { carbs: 4, meals: 2, vegetables: 1, eating_window: 5 },
};
