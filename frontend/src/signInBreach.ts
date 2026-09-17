import type { Day, DayPayload, HistoryResponse, Questionnaire } from "./types";
import { crossesThreshold, crossesThresholdWhileOpen, crossingNotice } from "./violations";

/**
 * The reminder the page opens with: a crossing on yesterday or on the running day, or null when
 * neither has one.
 *
 * Each day is judged by how far along it is. A closed day answers every bound, its shortfalls
 * included. A day still open is judged on the figures its meals so far derive, which settles only
 * the bounds it grows into — yesterday reaches here still open when it was never closed.
 */
export function signInBreachReminder(questionnaire: Questionnaire,
                                     history: HistoryResponse): string | null {
  const yesterday = hasCrossed(questionnaire, history.days, history.yesterday);
  const today = hasCrossed(questionnaire, history.days, history.today);
  if (!yesterday && !today) return null;
  return crossingNotice(yesterday && today ? "both" : yesterday ? "yesterday" : "today");
}

function hasCrossed(questionnaire: Questionnaire, days: Day[], day: DayPayload): boolean {
  const recorded = days.find((closed) => closed.date === day.date);
  return recorded === undefined
    ? crossesThresholdWhileOpen(questionnaire, day.derived)
    : crossesThreshold(questionnaire, recorded.answers);
}
