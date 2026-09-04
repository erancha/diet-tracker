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

const MS_PER_DAY = 86_400_000;

// EventBridge Scheduler's day-of-week tokens, indexed to match Date.getDay() and WEEKDAY_LETTERS
// above. Mirrors WEEKDAYS in src/common/appconfig.py, which rejects a configured weigh-in weekday
// naming none of them.
const WEEKDAY_TOKENS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function weekdayIndexOf(weekday: string): number {
  const index = WEEKDAY_TOKENS.indexOf(weekday);
  if (index === -1) {
    throw new Error(`unknown weekday ${weekday}; expected one of ${WEEKDAY_TOKENS.join(", ")}`);
  }
  return index;
}

export function isWeighInDay(now: Date, weekday: string): boolean {
  return now.getDay() === weekdayIndexOf(weekday);
}

export function weekdayLetter(weekday: string): string {
  return WEEKDAY_LETTERS[weekdayIndexOf(weekday)];
}

// Whole days from a recorded date to the day now falls in — the calendar distance the rhythm is
// read in, not an elapsed-hours count.
export function daysSince(date: string, now: Date): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((midnight.getTime() - parseIsoDate(date).getTime()) / MS_PER_DAY);
}

export function minutesOfDay(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

// A weighing this recent still answers the weigh-in: the window reaches back past the previous
// morning, so a weigh-in taken a day early does not get re-prompted when its weekday comes round.
const RECENT_WEIGHING_HOURS = 36;

const MS_PER_MINUTE = 60_000;

// Instant a weighing was taken. One recorded before times were kept is known only to its day and
// counts as that day's latest moment, so an untimed weighing that may fall inside the recency
// window is treated as if it does.
function weighingInstant(entry: { date: string; at: string | null }): number {
  const day = parseIsoDate(entry.date).getTime();
  return entry.at === null ? day + MS_PER_DAY : day + minutesOfDay(entry.at) * MS_PER_MINUTE;
}

// The weigh-in day opens the weight section expanded while no weighing is recent enough to answer
// it — the one morning a week the section is what the user came to the page for.
export function expandWeightSection(now: Date, weekday: string,
                                    entries: readonly { date: string; at: string | null }[]): boolean {
  return isWeighInDay(now, weekday) && !entries.some(
    (entry) => now.getTime() - weighingInstant(entry) < RECENT_WEIGHING_HOURS * MS_PER_HOUR);
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

// Whether the clock still sits before a small-hours bound like "02:00" — the form the day-close
// grace times take in app.json. Compared by minutes of the local day, so the bound shuts for the
// whole rest of the day once passed.
export function beforeDailyCutoff(now: Date, cutoff: string): boolean {
  return now.getHours() * 60 + now.getMinutes() < minutesOfDay(cutoff);
}

const MS_PER_HOUR = 3_600_000;

// A meal is overdue in two ways: a day still carrying nothing by firstMealHour, and a day whose
// most recent meal is mealGapHours or more behind the clock. The gap is measured from when the meal
// was eaten, and stands on its own — a stale meal is overdue however early in the day it is. The
// tracker answers an overdue meal by blinking its add-meal toggle rather than opening the inputs.
//
// Meals are dated, not ordered, so the latest one is found by time rather than by position.
export function mealOverdue(now: Date, firstMealHour: number, mealGapHours: number,
                            meals: readonly { at: string }[]): boolean {
  if (meals.length === 0) return now.getHours() >= firstMealHour;
  const lastMeal = Math.max(...meals.map((m) => Date.parse(m.at)));
  return now.getTime() - lastMeal >= mealGapHours * MS_PER_HOUR;
}
