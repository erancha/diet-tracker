// Domain types shared across the frontend: the questionnaire config (fetched from the site
// origin at runtime) and the API's answer-history and submission payloads.

export interface Choice {
  id: string;
  label: string;
  value: number;
}

export interface Question {
  id: string;
  type: "single" | "points";
  text: string;
  choices: Choice[];
  panel_title?: string;
  max?: number;
}

export interface Rule {
  id: string;
  question_id: string;
  at_least?: number;
  below?: number;
  consecutive_days: number;
  message: string;
}

export interface Questionnaire {
  version: number;
  questions: Question[];
  rules: Rule[];
}

// A single question's stored answer — always a number (points, counts, hours, liters).
export type AnswerValue = number;

export interface Meal {
  id: string;
  at: string;
  carbs_choice: string;
  vegetables: boolean;
}

export interface Derived {
  carbs: number;
  meals: number;
  vegetables: number;
  eating_window: number;
}

export interface DayPayload {
  date: string;
  meals: Meal[];
  derived: Derived;
}

export interface Day {
  date: string;
  answers: Record<string, AnswerValue>;
}

export interface HistoryResponse {
  days: Day[];
  today: DayPayload;
  yesterday: DayPayload | null;
}

export interface NewMeal {
  at: string;
  carbs_choice: string;
  vegetables: boolean;
}

export interface Violation {
  message: string;
}

export interface SubmitResult {
  date: string;
  violations: Violation[];
}
