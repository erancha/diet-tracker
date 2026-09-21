import type { Day, DayPayload, HistoryResponse, Questionnaire } from "./types";
import { crossesScoreBound, type CrossedDays } from "./violations";

/**
 * Which of the two days the page opens on has a score past its bound — yesterday, the running
 * day, both, or null when neither has. The caller words the reminder and decides what to hang
 * off it, since a crossing naming yesterday also offers the way to yesterday's day view.
 *
 * A closed day is judged on its recorded score; a day still open, on the score its meals so far
 * derive — yesterday reaches here still open when it was never closed.
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
  return crossesScoreBound(questionnaire, recorded === undefined ? day.derived : recorded.answers);
}
