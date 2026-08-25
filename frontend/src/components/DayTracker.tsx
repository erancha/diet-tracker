import { useState } from "react";
import { carbsScales, deriveDay } from "../derive";
import type { DayPayload, Meal, NewMeal, Questionnaire } from "../types";
import { ChoiceFieldset } from "./ChoiceFieldset";
import { CollapsibleSection } from "./CollapsibleSection";
import { DayDashboard } from "./DayDashboard";
import { MealList } from "./MealList";

// Hours since the last meal below which the tracker starts collapsed instead of expanded.
const REOPEN_GAP_HOURS = 4;

// The meal time the form opens on is the current clock rounded down to a ten-minute mark and
// pushed back by a typical report lag: a meal is tapped in a few minutes after it was eaten, and
// its time is an estimate, not a stopwatch reading.
const TIME_STEP_MINUTES = 10;
const REPORT_LAG_MINUTES = 20;

// The intraday companion: records meals at the time they were eaten, shows the day's derived
// values live, lists today's meals for in-place correction or deletion, and closes a fully
// tracked day by asking only for water. Recorded meals are the evidence that floors the day-end
// form; the dashboard and close-day values come from the vector-pinned client derivation twin,
// so they always agree with the meal list rendered beside them — the server re-derives on submit
// and stays the authority.
export function DayTracker({ questionnaire, trackerStartHour, today, onAddMeal, onUpdateMeal,
                             onDeleteMeal, onCloseDay }: {
  questionnaire: Questionnaire;
  // First local hour at which a day with no recorded meals starts expanded (config.js).
  trackerStartHour: number;
  today: DayPayload;
  onAddMeal: (meal: NewMeal) => void;
  // Replaces the meal wholesale; a corrected time re-keys it, so the id is the one being replaced.
  onUpdateMeal: (id: string, meal: NewMeal) => void;
  onDeleteMeal: (id: string) => void;
  onCloseDay: (answers: Record<string, number>) => void;
}) {
  const carbsQuestion = questionnaire.questions.find((q) => q.id === "carbs")!;
  const drinkingQuestion = questionnaire.questions.find((q) => q.id === "drinking")!;
  const [carbsChoiceId, setCarbsChoiceId] = useState<string | undefined>(undefined);
  const [vegetables, setVegetables] = useState(false);
  const [fruit, setFruit] = useState(false);
  const [pickedAdditions, setPickedAdditions] = useState<Set<string>>(new Set());
  const [closing, setClosing] = useState(false);
  const [drinkingChoiceId, setDrinkingChoiceId] = useState<string | undefined>(undefined);
  const [mealTime, setMealTime] = useState(() => defaultMealTime(new Date()));
  const [editingId, setEditingId] = useState<string | undefined>(undefined);

  // Today's meals always resolve against the current questionnaire, so deriveDay's throw on an
  // unknown id is a real config/data fault, not a legal state — let the error boundary show it.
  const { weights, additionValues } = carbsScales(carbsQuestion);
  const derived = deriveDay(today.meals, weights, additionValues);

  // A meal cannot have been eaten yet, so the day's own clock caps the picker. Both values are
  // zero-padded "HH:MM" on the same day, so they compare as strings.
  const nowTime = clockTime(minutesOfDay(new Date()));
  const mealTimeIsFuture = mealTime > nowTime;

  // The meal under correction can vanish beneath the form — deleted from the list mid-edit, or
  // from another tab — and the form then goes back to recording a new meal.
  const editing = today.meals.find((m) => m.id === editingId);

  // Right after a meal the tracker has nothing left to ask, so it starts folded to its dashboard
  // and opens on its own only once the typical between-meals gap (four hours) has passed. A day
  // with no meals yet stays folded until the configured start hour — mornings need no tracking
  // prompt. Meals arrive in chronological sort-key order, so the last entry is the latest.
  const lastMeal = today.meals[today.meals.length - 1];
  const startCollapsed = lastMeal !== undefined
    ? Date.now() - Date.parse(lastMeal.at) < REOPEN_GAP_HOURS * 3_600_000
    : new Date().getHours() < trackerStartHour;

  // The meal inputs are the tallest thing here and are worth reading only when there is a meal to
  // report, so they fold away behind the dashboard, the actions and the meal list. They open with
  // the tracker itself: the same conditions that decide the tracker is due a meal decide the form
  // is worth showing. Opening the tracker by hand leaves them folded — the day's figures and its
  // meal list are what a manual look is usually after. A recorded meal or a sent correction folds
  // them again, returning the tracker to the state a finished report leaves it in.
  const [formCollapsed, setFormCollapsed] = useState(startCollapsed);

  // Only reachable through the submit button, which renders only once a grade is picked and is
  // disabled while the picked time is still ahead of the clock.
  // Additions are sent in config order so the recorded list is deterministic.
  function submitMeal() {
    const meal: NewMeal = { at: localIso(atClockTime(new Date(), mealTime)),
                            carbs_choice: carbsChoiceId!, vegetables, fruit,
                            additions: carbsQuestion.additions!
                              .filter((a) => pickedAdditions.has(a.id)).map((a) => a.id) };
    if (editing !== undefined) onUpdateMeal(editing.id, meal);
    else onAddMeal(meal);
    clearForm();
    // Folded here rather than in clearForm, which cancelling an edit also runs: an abandoned
    // correction leaves the inputs open for whatever the user meant to record instead.
    setFormCollapsed(true);
  }

  function clearForm() {
    setCarbsChoiceId(undefined);
    setVegetables(false);
    setFruit(false);
    setPickedAdditions(new Set());
    setMealTime(defaultMealTime(new Date()));
    setEditingId(undefined);
  }

  // Corrections run through the recording form, so a stored meal becomes the form's contents:
  // everything settable while recording is settable while correcting, the time included.
  function startEdit(meal: Meal) {
    setCarbsChoiceId(meal.carbs_choice);
    setVegetables(meal.vegetables);
    setFruit(meal.fruit);
    setPickedAdditions(new Set(meal.additions));
    setMealTime(meal.at.slice(11, 16));
    setEditingId(meal.id);
    setFormCollapsed(false);
  }

  return (
    <CollapsibleSection className="day-tracker" title="יומן היום" defaultCollapsed={startCollapsed}
                        summary={
      <DayDashboard questionnaire={questionnaire} derived={derived} />
    }>
      <CollapsibleSection className="meal-form" title="פרטי הארוחה" headingLevel={3}
                          collapsed={formCollapsed}
                          onToggle={() => setFormCollapsed((c) => !c)}>
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
          {carbsQuestion.additions!.map((addition) => (
            <label key={addition.id}>
              <input type="checkbox" checked={pickedAdditions.has(addition.id)}
                     onChange={(e) => setPickedAdditions((prev) => {
                       const next = new Set(prev);
                       if (e.target.checked) next.add(addition.id);
                       else next.delete(addition.id);
                       return next;
                     })} />
              {" "}{addition.label}
            </label>
          ))}
        </div>
        <label className="meal-time">
          שעת הארוחה{" "}
          <input type="time" value={mealTime} max={nowTime}
                 onChange={(e) => setMealTime(e.target.value)} />
        </label>
      </CollapsibleSection>
      {/* Sits outside the fold that hides the picker: it is the only account of why the submit
          button is disabled, and that button shows either way. */}
      {mealTimeIsFuture && <p className="notice">לא ניתן לרשום ארוחה בשעה עתידית</p>}
      <div className="tracker-actions">
        {carbsChoiceId !== undefined && (
          <button type="button" disabled={mealTimeIsFuture} onClick={submitMeal}>
            {editing !== undefined ? "עדכון ארוחה" : "רישום ארוחה"}
          </button>
        )}
        {editing !== undefined && (
          <button type="button" onClick={clearForm}>
            ביטול עריכה
          </button>
        )}
        {today.meals.length >= 2 && (
          <button type="button" onClick={() => setClosing((c) => !c)}>
            סגירת יום
          </button>
        )}
      </div>
      <MealList questionnaire={questionnaire} meals={today.meals} onEdit={startEdit}
                onDelete={onDeleteMeal} />
      {/* A day with fewer than two meals is not a tracked day worth closing from here; deleting
          down to one meal mid-close also folds the panel away. */}
      {closing && today.meals.length >= 2 && (
        <div className="close-day">
          <ChoiceFieldset question={drinkingQuestion} selectedId={drinkingChoiceId}
                          onPick={(choice) => setDrinkingChoiceId(choice.id)} />
          <button type="button" disabled={drinkingChoiceId === undefined}
                  onClick={() => onCloseDay({ ...derived,
                    drinking: drinkingQuestion.choices.find((c) => c.id === drinkingChoiceId)!.value })}>
            אישור וסגירה
          </button>
        </div>
      )}
    </CollapsibleSection>
  );
}

function minutesOfDay(at: Date): number {
  return at.getHours() * 60 + at.getMinutes();
}

// "HH:MM" for a count of minutes since local midnight.
function clockTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:` +
    `${String(minutes % 60).padStart(2, "0")}`;
}

// Never reaches back past midnight: the server accepts today's meals only, and a meal reported
// in the first minutes of a day was still eaten on that day.
function defaultMealTime(now: Date): string {
  const minutes = minutesOfDay(now);
  return clockTime(Math.max(0, minutes - minutes % TIME_STEP_MINUTES - REPORT_LAG_MINUTES));
}

// The current date carrying the picked wall-clock time, whole minutes.
function atClockTime(now: Date, picked: string): Date {
  const [hours, minutes] = picked.split(":").map(Number);
  const at = new Date(now);
  at.setHours(hours, minutes, 0, 0);
  return at;
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
