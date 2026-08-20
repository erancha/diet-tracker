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

export function yesterdayOf(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
}

export function last7Days(endDateStr: string): string[] {
  const end = parseIsoDate(endDateStr);
  return Array.from({ length: 7 }, (_, i) =>
    isoDate(new Date(end.getFullYear(), end.getMonth(), end.getDate() - (6 - i))));
}

// From the first evening reminder onward (reminderHour, delivered via config.js from the
// stack's ReminderHours parameter), a day with no recorded meals is headed for retrospective
// entry, so the day-end questionnaire opens expanded instead of waiting behind its
// collapsed-by-default toggle.
export function expandQuestionnaire(now: Date, reminderHour: number, mealsRecorded: number, todaySubmitted: boolean): boolean {
  return now.getHours() >= reminderHour && mealsRecorded === 0 && !todaySubmitted;
}

// Before 04:00, with neither today nor yesterday filled yet, the questionnaire being filled now
// is almost always for the day that just ended — default to yesterday so after-midnight users
// don't have to notice and switch the picker themselves.
export function defaultDay(now: Date, filledDates: Set<string>): "today" | "yesterday" {
  const afterMidnightGap = now.getHours() < 4
    && !filledDates.has(isoDate(yesterdayOf(now)))
    && !filledDates.has(isoDate(now));
  return afterMidnightGap ? "yesterday" : "today";
}
