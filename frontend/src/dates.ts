// Local calendar day, e.g. "2026-08-18" — matches the API's YYYY-MM-DD sort key format.
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
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

// The questionnaire closes a finished day, so the day it opens on is the last one that ended:
// today from the evening reminder onward, yesterday for the whole stretch before it — the small
// hours after midnight included, when the day just ended is the one awaiting answers.
export function defaultDay(now: Date, reminderHour: number): "today" | "yesterday" {
  return dayEnded(now, reminderHour) ? "today" : "yesterday";
}
