import type { Questionnaire } from "./types";

// Mirrors the production config's shape: two fully numeric (chartable) questions — one with an
// open-ended bottom bound, one with an open-ended top bound — and one non-numeric multi question.
export const fixtureQuestionnaire: Questionnaire = {
  version: 1,
  questions: [
    {
      id: "drinking",
      type: "single",
      text: "שתיה",
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
      choices: [
        { id: "h8", label: "8 שעות", value: 8 },
        { id: "over", label: "מעל 12 שעות !!", value: 13 },
      ],
    },
    {
      id: "snacks",
      type: "multi",
      text: "נשנושים",
      choices: [
        { id: "nuts", label: "אגוזים" },
        { id: "fruit", label: "פרי" },
      ],
    },
  ],
  rules: [
    { id: "r_drink", question_id: "drinking", violating_choice_ids: ["low"], consecutive_days: 2, message: "m1" },
    { id: "r_snacks", question_id: "snacks", violating_choice_ids: ["nuts"], consecutive_days: 2, message: "m2" },
  ],
};
