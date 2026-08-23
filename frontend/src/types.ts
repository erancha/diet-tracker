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
  // Trend-panel heading; a question carrying either field charts as a panel. panel_title is a
  // full standalone heading, panel_qualifier a suffix to text — composed by panelTitle, which
  // documents when each applies.
  panel_title?: string;
  panel_qualifier?: string;
  max?: number;
  // Present only on the carbs question: the accompaniments a meal may carry (a sweet, alcohol,
  // too many nuts), each with the point cost it adds on top of the meal's grade. Not choices,
  // so they never appear in the grade picker.
  additions?: Choice[];
  // Hover explanation shown wherever the question text is a heading (form legend, history header).
  tooltip?: string;
  // Parenthesized qualifiers appended to the text per heading scope (see questionTitle): text
  // alone names the subject; a day heading shows a summed score, a tracker meal a single grade.
  day_qualifier?: string;
  meal_qualifier?: string;
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
  fruit: boolean;
  // Addition ids from the carbs question's additions (e.g. "sweet"); the server normalizes
  // legacy sweet-flag records into this shape.
  additions: string[];
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
  // Sorted newest first, so days[0] is the most recent recorded day.
  days: Day[];
  today: DayPayload;
  yesterday: DayPayload | null;
}

export interface NewMeal {
  at: string;
  carbs_choice: string;
  vegetables: boolean;
  fruit: boolean;
  additions: string[];
}

export interface Violation {
  message: string;
}

export interface SubmitResult {
  date: string;
  violations: Violation[];
}
