import { useState } from "react";
import type { DayPayload, NewMeal, Questionnaire } from "../types";
import { ChoiceFieldset } from "./ChoiceFieldset";
import { CollapsibleSection } from "./CollapsibleSection";
import { DayDashboard } from "./DayDashboard";
import { MealList } from "./MealList";

// Hours since the last meal below which the tracker starts collapsed instead of expanded.
const REOPEN_GAP_HOURS = 4;

// The intraday companion: records meals as they happen, shows the day's derived values live,
// lists today's meals for delete-and-re-report correction, and closes a fully tracked day by
// asking only for water. Recorded meals are the evidence that floors the day-end form; this
// component renders the server's derived values verbatim and never computes its own.
export function DayTracker({ questionnaire, today, onAddMeal, onDeleteMeal, onCloseDay }: {
  questionnaire: Questionnaire;
  today: DayPayload;
  onAddMeal: (meal: NewMeal) => void;
  onDeleteMeal: (id: string) => void;
  onCloseDay: (answers: Record<string, number>) => void;
}) {
  const carbsQuestion = questionnaire.questions.find((q) => q.id === "carbs")!;
  const drinkingQuestion = questionnaire.questions.find((q) => q.id === "drinking")!;
  const [carbsChoiceId, setCarbsChoiceId] = useState<string | undefined>(undefined);
  const [vegetables, setVegetables] = useState(false);
  const [fruit, setFruit] = useState(false);
  const [sweet, setSweet] = useState(false);
  const [closing, setClosing] = useState(false);
  const [drinkingChoiceId, setDrinkingChoiceId] = useState<string | undefined>(undefined);

  // Right after a meal the tracker has nothing left to ask, so it starts folded to its dashboard
  // and opens on its own only once the typical between-meals gap (four hours) has passed. Meals
  // arrive in chronological sort-key order, so the last entry is the latest.
  const lastMeal = today.meals[today.meals.length - 1];
  const withinMealGap = lastMeal !== undefined &&
    Date.now() - Date.parse(lastMeal.at) < REOPEN_GAP_HOURS * 3_600_000;

  // Only reachable through the record button, which renders only once a grade is picked.
  function recordMeal() {
    onAddMeal({ at: localIso(new Date()), carbs_choice: carbsChoiceId!, vegetables, fruit, sweet });
    setCarbsChoiceId(undefined);
    setVegetables(false);
    setFruit(false);
    setSweet(false);
  }

  return (
    <CollapsibleSection className="day-tracker" title="יומן היום" defaultCollapsed={withinMealGap}
                        summary={
      <DayDashboard questionnaire={questionnaire} derived={today.derived} />
    }>
      <ChoiceFieldset question={carbsQuestion} selectedId={carbsChoiceId} scope="meal"
                      onPick={(choice) => setCarbsChoiceId(choice.id)} />
      <div className="meal-flags">
        <label>
          <input type="checkbox" checked={vegetables}
                 onChange={(e) => setVegetables(e.target.checked)} />
          {" "}כולל ירקות
        </label>
        <label>
          <input type="checkbox" checked={fruit}
                 onChange={(e) => setFruit(e.target.checked)} />
          {" "}כולל פרי
        </label>
        <label>
          <input type="checkbox" checked={sweet}
                 onChange={(e) => setSweet(e.target.checked)} />
          {" "}כולל מתוק
        </label>
      </div>
      <div className="tracker-actions">
        {carbsChoiceId !== undefined && (
          <button type="button" onClick={recordMeal}>
            רישום ארוחה
          </button>
        )}
        {today.meals.length >= 2 && (
          <button type="button" onClick={() => setClosing((c) => !c)}>
            סגירת יום
          </button>
        )}
      </div>
      <MealList questionnaire={questionnaire} meals={today.meals} onDelete={onDeleteMeal} />
      {/* A day with fewer than two meals is not a tracked day worth closing from here; deleting
          down to one meal mid-close also folds the panel away. */}
      {closing && today.meals.length >= 2 && (
        <div className="close-day">
          <ChoiceFieldset question={drinkingQuestion} selectedId={drinkingChoiceId}
                          onPick={(choice) => setDrinkingChoiceId(choice.id)} />
          <button type="button" disabled={drinkingChoiceId === undefined}
                  onClick={() => onCloseDay({ ...today.derived,
                    drinking: drinkingQuestion.choices.find((c) => c.id === drinkingChoiceId)!.value })}>
            אישור וסגירה
          </button>
        </div>
      )}
    </CollapsibleSection>
  );
}

// Client-local ISO timestamp with offset — the eating window is the user's clock, not UTC.
function localIso(now: Date): string {
  const tz = -now.getTimezoneOffset();
  const sign = tz >= 0 ? "+" : "-";
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `${sign}${pad(Math.trunc(tz / 60))}:${pad(tz % 60)}`;
}
