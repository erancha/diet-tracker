import type { Day, DayPayload, HistoryResponse, Questionnaire } from "./types";
import { crossesThreshold, crossesThresholdWhileOpen, type CrossedDays } from "./violations";

/**
 * Which of the two days the page opens on has crossed a bound — yesterday, the running day, both,
 * or null when neither has. The caller words the reminder and decides what to hang off it, since
 * a crossing naming yesterday also offers the way to yesterday's day view.
 *
 * Each day is judged by how far along it is. A closed day answers every bound, its shortfalls
 * included. A day still open is judged on the figures its meals so far derive, which settles only
 * the bounds it grows into — yesterday reaches here still open when it was never closed.
 */
export function signInCrossedDays(questionnaire: Questionnaire,
                                  history: HistoryResponse): CrossedDays | null {
  const yesterday = hasCrossed(questionnaire, history.days, history.yesterday);
  const today = hasCrossed(questionnaire, history.days, history.today);
  if (!yesterday && !today) return null;
  return yesterday && today ? "both" : yesterday ? "yesterday" : "today";
}

function hasCrossed(questionnaire: Questionnaire, days: Day[], day: DayPayload): boolean {
  const recorded = days.find((closed) => closed.date === day.date);
  return recorded === undefined
    ? crossesThresholdWhileOpen(questionnaire, day.derived)
    : crossesThreshold(questionnaire, recorded.answers);
}
