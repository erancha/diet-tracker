import type { HistoryResponse, WeightPayload } from "./types";

// Whether the signed-in account still holds nothing — the single reading every first-visit behavior
// answers to, so no two of them can reach a different verdict about the same account. Meals count
// alongside the recorded days because a day is recorded only once it is closed: someone part-way
// through their first day has started.
export function isFirstVisit(history: HistoryResponse, weight: WeightPayload): boolean {
  return history.days.length === 0
    && history.today.meals.length === 0 && history.yesterday.meals.length === 0
    && weight.entries.length === 0 && weight.target === null;
}
