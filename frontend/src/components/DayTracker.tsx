import { useState, type ReactNode } from "react";
import { clockTimeOf, expandMealForm } from "../dates";
import { carbsScales, deriveDay, smallPortionOffered } from "../derive";
import { mayDiscardEdits } from "../edits";
import type { DayPayload, Meal, NewMeal, Questionnaire } from "../types";
import { ChoiceFieldset } from "./ChoiceFieldset";
import { CollapsibleSection } from "./CollapsibleSection";
import { DayDashboard } from "./DayDashboard";
import { MealList } from "./MealList";

// The meal time the form opens on is the current clock rounded down to a ten-minute mark and
// pushed back by a typical report lag: a meal is tapped in a few minutes after it was eaten, and
// its time is an estimate, not a stopwatch reading.
const TIME_STEP_MINUTES = 10;
const REPORT_LAG_MINUTES = 20;

// Closing the day from here is offered only once the recorded meals span this much of the day;
// anything narrower is a day still being eaten, whose figures would be closed too early. A day
// under two meals derives a zero window, so it never reaches this floor either. The full day-end
// questionnaire closes a day the tracker declines to.
const CLOSE_DAY_MIN_WINDOW_HOURS = 6;

// The intraday companion: records meals at the time they were eaten, shows the day's derived
// values live, lists today's meals for in-place correction or deletion, and closes a fully
// tracked day by asking only for water. Recorded meals are the evidence that floors the day-end
// form; the dashboard and close-day values come from the vector-pinned client derivation twin,
// so they always agree with the meal list rendered beside them — the server re-derives on submit
// and stays the authority.
export function DayTracker({ questionnaire, today, firstMealHour, mealGapHours, headerAside,
                             onAddMeal, onUpdateMeal, onDeleteMeal, onCloseDay }: {
  questionnaire: Questionnaire;
  today: DayPayload;
  firstMealHour: number;
  mealGapHours: number;
  // Shares the tracker's title row, for a neighbouring section folded down to its own title line.
  headerAside?: ReactNode;
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
  const [smallPortion, setSmallPortion] = useState(false);
  const [closing, setClosing] = useState(false);
  const [drinkingChoiceId, setDrinkingChoiceId] = useState<string | undefined>(undefined);
  const [mealTime, setMealTime] = useState(() => defaultMealTime(new Date()));
  // The time the form last opened on. Held rather than recomputed: the default walks with the
  // clock, and a freshly derived one would read ten minutes on as a time the user had picked.
  const [pristineTime, setPristineTime] = useState(mealTime);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);

  // Today's meals always resolve against the current questionnaire, so deriveDay's throw on an
  // unknown id is a real config/data fault, not a legal state — let the error boundary show it.
  const { weights, additionValues, smallPortion: portionRule } = carbsScales(carbsQuestion);
  const derived = deriveDay(today.meals, weights, additionValues, portionRule);
  // The lighter grades are not worth splitting by helping, so the box appears only where it moves
  // the score — and the flag goes with it, so a grade switched down cannot leave one stuck on.
  const offersSmallPortion = carbsChoiceId !== undefined
    && smallPortionOffered(portionRule, weights[carbsChoiceId]);
  const closable = derived.eating_window >= CLOSE_DAY_MIN_WINDOW_HOURS;

  // A meal cannot have been eaten yet, so the day's own clock caps the picker. Both values are
  // zero-padded "HH:MM" on the same day, so they compare as strings.
  const nowTime = clockTime(minutesOfDay(new Date()));
  const mealTimeIsFuture = mealTime > nowTime;

  // The meal under correction can vanish beneath the form — deleted from the list mid-edit, or
  // from another tab — and the form then goes back to recording a new meal.
  const editing = today.meals.find((m) => m.id === editingId);

  // Whether the form still matches the meal it opened on — what separates an exit from a discard,
  // for the one button that serves as both.
  const editDiverged = editing !== undefined && formDiverged(editing);

  // A half-composed new meal is worth the same guard as a correction: the form holds the only copy
  // of it. Its baseline is the blank form recording opens on rather than a stored meal, and the
  // small-portion box is not among the terms because it exists only once a grade is picked.
  const newMealDiverged = editing === undefined
    && (carbsChoiceId !== undefined || vegetables || fruit || pickedAdditions.size > 0
        || mealTime !== pristineTime);

  // The meal inputs are the tallest thing here and are worth reading only when there is a meal to
  // report, so the tracker opens on the day's figures and its recorded meals with the inputs
  // folded away behind them — unless a meal is overdue, when reporting one is the likeliest reason
  // for the visit. This decides only where the section opens: recording a meal or sending a
  // correction folds the inputs again, and opening a meal for editing unfolds them.
  const [formCollapsed, setFormCollapsed] =
    useState(() => !expandMealForm(new Date(), firstMealHour, mealGapHours, today.meals));

  // Only reachable through the submit button, which renders only once a grade is picked and is
  // disabled while the picked time is still ahead of the clock.
  // Additions are sent in config order so the recorded list is deterministic.
  function submitMeal() {
    const meal: NewMeal = { at: localIso(atClockTime(new Date(), mealTime)),
                            carbs_choice: carbsChoiceId!, vegetables, fruit,
                            additions: carbsQuestion.additions!
                              .filter((a) => pickedAdditions.has(a.id)).map((a) => a.id),
                            small_portion: offersSmallPortion && smallPortion };
    if (editing !== undefined) onUpdateMeal(editing.id, meal);
    else onAddMeal(meal);
    clearForm();
    // Folded here rather than in clearForm, which cancelling an edit also runs: an abandoned
    // correction leaves the inputs open for whatever the user meant to record instead.
    setFormCollapsed(true);
  }

  // The two ways out of an open form — the button beside the one that commits it, and folding the
  // inputs away — both spend what the form holds, so both ask through the shared discard guard.
  // Reports whether the form was released; a dismissed dialog keeps it.
  function discardForm(): boolean {
    if (!mayDiscardEdits(editDiverged || newMealDiverged)) return false;
    clearForm();
    return true;
  }

  // Folding the inputs away puts whatever the form holds out of sight, so it empties the form
  // first — a correction in progress and a half-composed meal alike. A dismissed discard dialog
  // keeps the inputs open around what it refused to throw away. Unfolding loses nothing.
  function toggleForm() {
    if (!formCollapsed && !discardForm()) return;
    setFormCollapsed((c) => !c);
  }

  function formDiverged(meal: Meal): boolean {
    return carbsChoiceId !== meal.carbs_choice
        || vegetables !== meal.vegetables
        || fruit !== meal.fruit
        || mealTime !== clockTimeOf(meal.at)
        || (offersSmallPortion && smallPortion) !== meal.small_portion
        || pickedAdditions.size !== meal.additions.length
        || meal.additions.some((id) => !pickedAdditions.has(id));
  }

  function clearForm() {
    setCarbsChoiceId(undefined);
    setVegetables(false);
    setFruit(false);
    setPickedAdditions(new Set());
    setSmallPortion(false);
    const opensOn = defaultMealTime(new Date());
    setMealTime(opensOn);
    setPristineTime(opensOn);
    setEditingId(undefined);
  }

  // Corrections run through the recording form, so a stored meal becomes the form's contents:
  // everything settable while recording is settable while correcting, the time included.
  function startEdit(meal: Meal) {
    setCarbsChoiceId(meal.carbs_choice);
    setVegetables(meal.vegetables);
    setFruit(meal.fruit);
    setPickedAdditions(new Set(meal.additions));
    setSmallPortion(meal.small_portion);
    setMealTime(clockTimeOf(meal.at));
    setEditingId(meal.id);
    setFormCollapsed(false);
  }

  return (
    <CollapsibleSection className="day-tracker" title="יומן היום" headerAside={headerAside}
                        summary={
      <DayDashboard questionnaire={questionnaire} derived={derived} />
    }>
      <CollapsibleSection className="meal-form" headingLevel={3}
                          title={editing !== undefined ? "עדכון ארוחה" : "הוספת ארוחה"}
                          collapsed={formCollapsed}
                          onToggle={toggleForm}>
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
          {offersSmallPortion && (
            <label>
              <input type="checkbox" checked={smallPortion}
                     onChange={(e) => setSmallPortion(e.target.checked)} />
              {" "}{carbsQuestion.small_portion!.label}
            </label>
          )}
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
      <div className="form-actions">
        {carbsChoiceId !== undefined && (
          <button type="button" disabled={mealTimeIsFuture} onClick={submitMeal}>
            שמירת ארוחה
          </button>
        )}
        {editing !== undefined && (
          <button type="button" className={editDiverged ? "quiet destructive" : "quiet"}
                  onClick={() => discardForm()}>
            {editDiverged ? "ביטול שינויים" : "יציאה מעריכה"}
          </button>
        )}
        {closable && (
          <button type="button" className="quiet" onClick={() => setClosing((c) => !c)}>
            סגירת יום
          </button>
        )}
      </div>
      <MealList questionnaire={questionnaire} meals={today.meals} onEdit={startEdit}
                onDelete={onDeleteMeal} />
      {/* Deleting or correcting a meal mid-close can narrow the day back under the window that
          offered closing, and the panel folds away with the button that opened it. */}
      {closing && closable && (
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
