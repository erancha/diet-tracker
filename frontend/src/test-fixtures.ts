import type { Questionnaire } from "./types";

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
