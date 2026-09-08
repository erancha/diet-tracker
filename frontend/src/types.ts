// Domain types shared across the frontend: the app config (fetched from the site origin at
// runtime) and the API's answer-history, submission, and weight payloads.

export interface Choice {
  id: string;
  // What the choice is called, on its own. The carbs grades read as a name and a list of what the
  // grade covers, and the two are held apart so a label can be shown at either density.
  label: string;
  // What the grade covers, listed. Present only on the carbs choices; every other question's
  // choices name themselves completely.
  examples?: string;
  value: number;
  // A choice phrased as an open-ended bound ("מעל 12 שעות") answers for everything past the
  // ladder's last measured step: its value is a sentinel one step beyond, not a quantity, so
  // only its wording states its meaning and it marks no gridline position.
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
  // Present only on points questions: what one meal must cost — its grade, second source,
  // escalated fruit and additions together — to count as heavy. The day-scope counterpart is this
  // question's rule threshold, so each scope states its bound once, priced the same way.
  heavy_meal?: number;
  // Present only on the carbs question: the accompaniments a meal may carry (a sweet, alcohol,
  // nuts), each with the point cost a routine amount of it adds on top of the meal's grade. Not
  // choices, so they never appear in the grade picker.
  additions?: Choice[];
  // Present only on the carbs question: the scale an addition's amount is recorded on, reaching
  // past 100% — the surcharge prices a routine amount, so a taste costs less and a heaped one
  // more. `default` names the step a newly checked addition carries.
  amounts?: { default: string; options: ScaleOption[] };
  // Present only on the carbs question: the quantity axis the grade ladder does not carry — the
  // helping-size scale shared by both of a plate's carb sources. The primary source offers the
  // choice only from `from_value` up, where a lighter helping is a distinction worth drawing.
  portions?: { from_value: number; options: ScaleOption[] };
  // Present only on the carbs question: the second-carb-source contract. A plate earns a second
  // source only around a light primary grade — one weighing in (0, light_grade_max]. A second
  // source that is itself light merges into the plate, the higher grade speaking for both; a
  // heavier one always carries one of the shared helpings, adding its grade at that percentage.
  second_source?: { light_grade_max: number };
  // Present only on the carbs question: what the program excludes from its six non-treat days —
  // every carb source graded excluded_grade or heavier, and the additions excluded_additions
  // names. The trend chart plots the part of each day score they account for beside the score.
  excluded_grade?: number;
  excluded_additions?: string[];
  // Display floor: history answers below it redden on their own, day by day — unlike a rule's
  // bound, which alarms only after its consecutive-days streak.
  warn_below?: number;
  // The day value the plan treats as routine: a history cell holding any other value is bolded,
  // so deviations to either side stand out down the column while routine days recede.
  norm?: number;
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
  above?: number;
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

// One sample-question link above the chat composer: the short link text, and the full question
// it pastes into the input.
export interface ChatSampleQuestion {
  label: string;
  question: string;
}

// Frontend-only section of config/app.json — load() in src/common/appconfig.py picks out only
// the keys it names, so this rides along without touching the Lambdas.
export interface ChatSettings {
  sample_questions: ChatSampleQuestion[];
}

export interface MealsSettings {
  // Meals a day may hold. The tracker folds recording away at this count, matching the cap the
  // API enforces.
  max_per_day: number;
}

// Small-hours grace bounds for the previous day, zero-padded "HH:MM" wall-clock times mirroring
// DayCloseConfig in src/common/appconfig.py: until close_until the tracker still targets an
// unclosed yesterday, and until delete_until (never later than close_until) its record may still
// be deleted from the history table.
export interface DayCloseSettings {
  close_until: string;
  delete_until: string;
  // Eating-window hours a day's meals must span before the tracker offers closing.
  min_window_hours: number;
}

// Frontend-only section of config/app.json, like ChatSettings: the weekday the program's treat
// meal is aimed at, as one of the EventBridge Scheduler tokens WEEKDAY_TOKENS in dates.ts
// mirrors. The trend chart frames that column; no rule reads it, and no stored day is marked by
// it — it is a target drawn on a chart, not something the app records.
export interface TreatDaySettings {
  weekday: string;
}

// config/app.json as the frontend fetches it from its own origin.
export interface AppConfigFile {
  questionnaire: Questionnaire;
  weight: WeightSettings;
  meals: MealsSettings;
  day_close: DayCloseSettings;
  treat_day: TreatDaySettings;
  chat: ChatSettings;
}

// A single question's stored answer — always a number (points, counts, hours, liters).
export type AnswerValue = number;

/** One step of a quantity scale — a carb source's helping, an addition's amount — pricing what
 * it is recorded on at `percent` of its value. */
export interface ScaleOption {
  id: string;
  label: string;
  percent: number;
}

/** A plate's second carb source: the grade it drew on and the helping it was eaten as. A light
 * grade merges into the plate and carries no portion (null); a heavier grade always carries one
 * of the configured portion ids. */
export interface CarbSource {
  carbs_choice: string;
  portion: string | null;
}

/** One addition on a plate: which accompaniment, and how much of it — an amount id from the
 * carbs question's amounts scale, or null on a meal recorded before the scale existed, which
 * prices as the whole surcharge. */
export interface MealAddition {
  id: string;
  amount: string | null;
}

export interface Meal {
  id: string;
  at: string;
  carbs_choice: string;
  vegetables: boolean;
  fruit: boolean;
  // The meal's additions, each with its amount; the server normalizes legacy sweet-flag and
  // bare-id records into this shape.
  additions: MealAddition[];
  // The helping the meal's own grade was eaten as — one of the configured portion ids, or null
  // when no helping is recorded: a grade below the scale's threshold, or a meal the server read
  // from before the scale existed.
  portion: string | null;
  // A second carb source on the same plate. A light one merges into the plate, the higher grade
  // speaking for both; a heavier one — a slice of white bread beside a grade 2 bowl — rides at
  // its recorded helping priced beside the plate's grade. Null on a plate that drew on one source.
  second_source: CarbSource | null;
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
  // The part of the day's carb score that came from what the program excludes on its six
  // non-treat days, derived from the day's recorded meals. Never above the carb answer itself,
  // since every point it counts is also counted there.
  excluded: number;
}

// A recorded day narrowed to the values it answers, for reads that judge a day by those alone.
// The excluded part of its carb score is charted rather than answered, so it is no part of this
// shape.
export type AnsweredDay = Pick<Day, "date" | "answers">;

// One message the app addressed to the user that SES refused to deliver, kept so the header can
// show what never reached their inbox. The body is the text as the sending job wrote it, without
// the mute footnote and app link an email closes with.
export interface UndeliveredMessage {
  // UTC ISO timestamp of the refusal — the message's identity for a dismissal.
  at: string;
  subject: string;
  body: string;
  // The right-to-left HTML the email carried, rendered by the server from the same body. Shown
  // as the message itself, so the bell presents the mail that never arrived rather than a
  // re-typeset copy of it.
  html: string;
}

export interface HistoryResponse {
  // Sorted newest first, so days[0] is the most recent recorded day.
  days: Day[];
  today: DayPayload;
  yesterday: DayPayload;
  // Whether the account has opted out of the reminders, alerts and digests it would otherwise be
  // sent. The app itself is unaffected — a muted account still sees its own violations here.
  muted: boolean;
  // Newest first. Rides along with muted because both feed the header alone.
  undelivered: UndeliveredMessage[];
}

// The history payload carrying how long its own request took. The number is measured in the
// browser by api.ts, not sent by the server: it covers the network, token verification, Lambda
// start and the reads together — the whole wait the trend chart sits behind.
export interface LoadedHistory extends HistoryResponse {
  loadedInMs: number;
}

export interface NotificationSettings {
  muted: boolean;
}

// A count split into the trailing week and the account's whole history.
export interface WeekAndTotal {
  week: number;
  total: number;
}

// One pool account in the admin's activity overview: week-and-total counts, an all-time weighing
// count and a target-set flag only, no recorded content — the target arrives as a boolean, never
// as the kilograms. The server returns the list ordered by the trailing week, most active first.
export interface AdminActivityUser {
  email: string;
  days: WeekAndTotal;
  meals: WeekAndTotal;
  chats: WeekAndTotal;
  weights: number;
  target: boolean;
}

export interface AdminActivity {
  users: AdminActivityUser[];
}

export interface NewMeal {
  at: string;
  carbs_choice: string;
  vegetables: boolean;
  fruit: boolean;
  additions: MealAddition[];
  portion: string | null;
  second_source: CarbSource | null;
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
  // Wall-clock "HH:MM" the weighing was recorded at. Null on weighings recorded before the time
  // was kept — the rhythm reading draws on the ones that carry it and leaves those alone.
  at: string | null;
}

export interface WeightPayload {
  // null until the user sets a target — the chart then draws no reference line.
  target: number | null;
  // Oldest first, the order the chart plots them in.
  entries: WeightEntry[];
}

export interface ChatSource {
  fileName: string;
  // Best similarity score among the document's retrieved chunks, 0–1.
  score: number;
}

export interface ChatAnswer {
  answer: string;
  // Empty when no document matched the question.
  sources: ChatSource[];
  // UTC ISO timestamp keying the stored chat — its identity for a later delete. A follow-up's
  // answer carries a fresh key.
  at: string;
}

// One stored exchange from the user's chat history: a question and its answer, or — once
// summarized — a conversation's opening question and the digest standing for the whole of it.
export interface ChatTurn {
  question: string;
  answer: string;
  sources: ChatSource[];
  // Whether the answer is a digest rather than a reply to the question. It stands until the chat
  // moves on: a follow-up replaces the digest and clears the mark.
  summarized: boolean;
  // UTC ISO timestamp of the chat's latest answer — the transcript's sort key.
  at: string;
}

export interface ChatTranscript {
  // Newest first, the order the chat renders them in.
  turns: ChatTurn[];
}
