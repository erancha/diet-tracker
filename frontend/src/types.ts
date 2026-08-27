// Domain types shared across the frontend: the app config (fetched from the site origin at
// runtime) and the API's answer-history, submission, and weight payloads.

export interface Choice {
  id: string;
  label: string;
  value: number;
  // A choice phrased as an open-ended bound ("מעל 12 שעות", "פחות מ-2.5 ליטר") answers for
  // everything past the ladder's last measured step, so its value is a sentinel one step beyond
  // that step rather than a quantity. Its wording is the only thing that states what it means, so
  // it survives wherever other choices reduce to their number, and it marks no position a
  // gridline could sit on.
  bound?: boolean;
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
  // Present only on the carbs question: the quantity axis the grade ladder does not carry. A meal
  // marked as this portion counts its grade's weight at `percent`, offered only from `from_value`
  // up — where a lighter helping is a distinction worth drawing and the reduced weight still
  // lands above zero.
  small_portion?: { label: string; from_value: number; percent: number };
  // What the question measures. Named once in the day-scope heading, so the values under it are
  // free to read as bare numbers instead of repeating it per row.
  unit?: string;
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

// Months the weight chart may span. null is the whole series; the values mirror CHART_SPANS in
// src/common/appconfig.py, which rejects a configured span the selector cannot offer.
export type ChartSpan = 1 | 3 | 6 | 12 | null;

export interface WeightSettings {
  weigh_in: { weekday: string; hour: number };
  // The span the chart opens on.
  chart_months: ChartSpan;
  // Kilogram bounds the weight inputs constrain to, matching what the API accepts.
  limits: { min_kg: number; max_kg: number };
}

// config/app.json as the frontend fetches it from its own origin.
export interface AppConfigFile {
  questionnaire: Questionnaire;
  weight: WeightSettings;
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
  // Whether the meal was a small portion of its grade — the quantity the grade itself no longer
  // carries.
  small_portion: boolean;
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
  yesterday: DayPayload;
}

export interface NewMeal {
  at: string;
  carbs_choice: string;
  vegetables: boolean;
  fruit: boolean;
  additions: string[];
  small_portion: boolean;
}

export interface Violation {
  message: string;
}

export interface SubmitResult {
  date: string;
  violations: Violation[];
}

export interface WeightEntry {
  date: string;
  kg: number;
}

export interface WeightPayload {
  // null until the user sets a target — the chart then draws no reference line.
  target: number | null;
  // Oldest first, the order the chart plots them in.
  entries: WeightEntry[];
}
