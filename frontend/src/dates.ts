// Local calendar day, e.g. "2026-08-18" — matches the API's YYYY-MM-DD sort key format.
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Wall-clock "HH:MM" of a meal's local ISO timestamp — the format the meal-time input reads and
// writes, so a stored meal and the form editing it compare directly.
export function clockTimeOf(at: string): string {
  return at.slice(11, 16);
}

export function dayLabel(s: string): string {
  const [, m, d] = s.split("-");
  return `${Number(d)}.${Number(m)}`;
}

export function ddmmLabel(s: string): string {
  const [, m, d] = s.split("-");
  return `${d}/${m}`;
}

// Hebrew names the weekdays by the numeral letters א–ו, with שבת abbreviated ש; the geresh marks
// all seven as day names rather than stray letters. Index matches Date.getDay(), Sunday first.
const WEEKDAY_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

// Where the layout affords a wider date, the weekday leads it; the space between them is also the
// break opportunity that drops the date to a second line when the column is too narrow for both.
export function weekdayDdmmLabel(s: string): string {
  return `${WEEKDAY_LETTERS[parseIsoDate(s).getDay()]}׳ ${ddmmLabel(s)}`;
}

export function yesterdayOf(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
}

export function daysBefore(s: string, n: number): string {
  const d = parseIsoDate(s);
  return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n));
}

export function last7Days(endDateStr: string): string[] {
  return Array.from({ length: 7 }, (_, i) => daysBefore(endDateStr, 6 - i));
}

// The day counts as over for questionnaire purposes from the first evening reminder onward
// (reminderHour, delivered via config.js from the stack's ReminderHours parameter). Until then
// the day is still accumulating meals and cannot honestly be answered for.
export function dayEnded(now: Date, reminderHour: number): boolean {
  return now.getHours() >= reminderHour;
}

// A day with no recorded meals is headed for retrospective entry, so once it ends the day-end
// questionnaire opens expanded instead of waiting behind its collapsed-by-default toggle.
export function expandQuestionnaire(now: Date, reminderHour: number, mealsRecorded: number, todaySubmitted: boolean): boolean {
  return dayEnded(now, reminderHour) && mealsRecorded === 0 && !todaySubmitted;
}

const MS_PER_HOUR = 3_600_000;

// A meal is overdue in two ways, and either one opens the tracker's meal inputs expanded instead of
// leaving them behind their fold: a day still carrying nothing by firstMealHour, and a day whose
// most recent meal is mealGapHours or more behind the clock. The gap is measured from when the meal
// was eaten, and stands on its own — a stale meal opens the inputs however early in the day it is.
//
// Meals are dated, not ordered, so the latest one is found by time rather than by position.
export function expandMealForm(now: Date, firstMealHour: number, mealGapHours: number,
                               meals: readonly { at: string }[]): boolean {
  if (meals.length === 0) return now.getHours() >= firstMealHour;
  const lastMeal = Math.max(...meals.map((m) => Date.parse(m.at)));
  return now.getTime() - lastMeal >= mealGapHours * MS_PER_HOUR;
}

// The questionnaire closes a finished day, so the day it opens on is the last one that ended:
// today from the evening reminder onward, yesterday for the whole stretch before it — the small
// hours after midnight included, when the day just ended is the one awaiting answers.
export function defaultDay(now: Date, reminderHour: number): "today" | "yesterday" {
  return dayEnded(now, reminderHour) ? "today" : "yesterday";
}
