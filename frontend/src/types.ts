// Domain types shared across the frontend: the questionnaire config (fetched from the site
// origin at runtime) and the API's answer-history and submission payloads.

export interface Choice {
  id: string;
  label: string;
  // Numeric unit mapping (e.g. liters, hours); present on every choice of a chartable question.
  value?: number;
}

export interface Question {
  id: string;
  type: "single" | "multi";
  text: string;
  choices: Choice[];
}

export interface Rule {
  id: string;
  question_id: string;
  violating_choice_ids: string[];
  consecutive_days: number;
  message: string;
}

export interface Questionnaire {
  version: number;
  questions: Question[];
  rules: Rule[];
}

// A single question's stored answer: one choice id, or the selected ids of a multi question.
export type AnswerValue = string | string[];

export interface Day {
  date: string;
  answers: Record<string, AnswerValue>;
}

export interface HistoryResponse {
  days: Day[];
}

export interface Violation {
  message: string;
}

export interface SubmitResult {
  date: string;
  violations: Violation[];
}
