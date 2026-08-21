import { useState } from "react";
import type { DayPayload, NewMeal, Questionnaire } from "../types";
import { ChoiceFieldset } from "./ChoiceFieldset";
import { CollapsibleSection } from "./CollapsibleSection";

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
  const [closing, setClosing] = useState(false);
  const [drinkingChoiceId, setDrinkingChoiceId] = useState<string | undefined>(undefined);

  const gradeLabel = (choiceId: string) =>
    carbsQuestion.choices.find((c) => c.id === choiceId)?.label ?? choiceId;
  const timeOf = (at: string) => at.slice(11, 16);

  // Only reachable through the record button, which renders only once a grade is picked.
  function recordMeal() {
    onAddMeal({ at: localIso(new Date()), carbs_choice: carbsChoiceId!, vegetables });
    setCarbsChoiceId(undefined);
    setVegetables(false);
  }

  return (
    <CollapsibleSection className="day-tracker" title="יומן היום" summary={
      <div className="tracker-dashboard">
        <span>ארוחות: {today.derived.meals}</span>
        <span>ירקות: {today.derived.vegetables}</span>
        <span>חלון: {today.derived.eating_window} שעות</span>
        <strong>ציון: {today.derived.carbs}</strong>
      </div>
    }>
      <ChoiceFieldset question={carbsQuestion} selectedId={carbsChoiceId}
                      onPick={(choice) => setCarbsChoiceId(choice.id)} />
      <label>
        <input type="checkbox" checked={vegetables}
               onChange={(e) => setVegetables(e.target.checked)} />
        {" "}כללה ירקות
      </label>
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
      <ul className="meal-list">
        {today.meals.map((meal) => (
          <li key={meal.id}>
            {timeOf(meal.at)} · {gradeLabel(meal.carbs_choice)}
            {meal.vegetables && " · 🥗"}
            <button type="button" aria-label={`מחיקת ארוחה ${timeOf(meal.at)}`}
                    onClick={() => { if (window.confirm("למחוק את הארוחה?")) onDeleteMeal(meal.id); }}>
              🗑️
            </button>
          </li>
        ))}
      </ul>
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
