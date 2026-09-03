import { useEffect, useState, type ReactNode } from "react";
import { clockTimeOf, mealOverdue } from "../dates";
import { carbsScales, deriveDay, smallPortionOffered } from "../derive";
import { mayDiscardEdits } from "../edits";
import { useExpandedGradeLabels } from "../gradeLabels";
import type { CarbSource, DayPayload, Meal, NewMeal, Question, Questionnaire } from "../types";
import { ChoiceFieldset } from "./ChoiceFieldset";
import { CollapsibleSection } from "./CollapsibleSection";
import { DayDashboard } from "./DayDashboard";
import { Icon } from "./Icon";
import { MealList } from "./MealList";

// The meal time the form opens on is the current clock rounded down to a five-minute mark: a
// meal's time is an estimate, not a stopwatch reading.
const TIME_STEP_MINUTES = 5;

// A meal drawing on no carb source says so by carrying none at all, so the plain no-carb grade is
// never a second one. The id is the config's, shared with the API's own rejection of it.
const NO_CARBS_CHOICE = "no_carbs";

// Headings and controls for the meal's optional second carb source. The grades it offers are the
// carbs question's own, so only the wording that frames them as an accompaniment lives here.
const SECOND_SOURCE_TITLE = "מקור פחמימה נוסף";
const SECOND_SOURCE_ADD = "הוספת מקור פחמימה נוסף";
const SECOND_SOURCE_REMOVE = "הסרת מקור פחמימה נוסף";

// The one control over how much of a grade's name the app spells out, reading as the state it
// moves to rather than the state it is in.
const EXPAND_LABELS = "הרחבת שמות";
const COLLAPSE_LABELS = "צמצום שמות";

// How long each of the nudge's escalating beats runs before the next takes over. The blink rate
// itself is the style sheet's, keyed by the phase the section's class carries.
const NUDGE_ESCALATION_MS = 10_000;

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
export function DayTracker({ questionnaire, today, firstMealHour, mealGapHours, maxMealsPerDay,
                             headerAside, onAddMeal, onUpdateMeal, onDeleteMeal, deletingMealId,
                             onCloseDay }: {
  questionnaire: Questionnaire;
  today: DayPayload;
  firstMealHour: number;
  mealGapHours: number;
  // Meals the day may hold — the same ceiling the API enforces.
  maxMealsPerDay: number;
  // Shares the tracker's title row, for a neighbouring section folded down to its own title line.
  headerAside?: ReactNode;
  onAddMeal: (meal: NewMeal) => void;
  // Replaces the meal wholesale; a corrected time re-keys it, so the id is the one being replaced.
  onUpdateMeal: (id: string, meal: NewMeal) => void;
  onDeleteMeal: (id: string) => void;
  // The meal whose onDeleteMeal call is still in flight; its row's delete control locks meanwhile.
  deletingMealId?: string;
  onCloseDay: (answers: Record<string, number>) => void;
}) {
  const carbsQuestion = questionnaire.questions.find((q) => q.id === "carbs")!;
  const drinkingQuestion = questionnaire.questions.find((q) => q.id === "drinking")!;
  const [carbsChoiceId, setCarbsChoiceId] = useState<string | undefined>(undefined);
  const [vegetables, setVegetables] = useState(false);
  const [fruit, setFruit] = useState(false);
  const [pickedAdditions, setPickedAdditions] = useState<Set<string>>(new Set());
  const [smallPortion, setSmallPortion] = useState(false);
  const [secondChoiceId, setSecondChoiceId] = useState<string | undefined>(undefined);
  const [secondSmallPortion, setSecondSmallPortion] = useState(false);
  // Held apart from the picked grade so the group can stand open and unanswered: revealing it is
  // the user saying a second source is coming, and until a grade is picked the meal has none.
  const [secondSourceOpen, setSecondSourceOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [drinkingChoiceId, setDrinkingChoiceId] = useState<string | undefined>(undefined);
  const [mealTime, setMealTime] = useState(() => defaultMealTime(new Date()));
  // The time the form last opened on. Held rather than recomputed: the default walks with the
  // clock, and a freshly derived one would read ten minutes on as a time the user had picked.
  const [pristineTime, setPristineTime] = useState(mealTime);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [expandLabels, setExpandLabels] = useExpandedGradeLabels();

  // Today's meals always resolve against the current questionnaire, so deriveDay's throw on an
  // unknown id is a real config/data fault, not a legal state — let the error boundary show it.
  const { weights, additionValues, smallPortion: portionRule } = carbsScales(carbsQuestion);
  const derived = deriveDay(today.meals, weights, additionValues, portionRule);
  // The lighter grades are not worth splitting by helping, so the box appears only where it moves
  // the score — and the flag goes with it, so a grade switched down cannot leave one stuck on.
  const offersSmallPortion = carbsChoiceId !== undefined
    && smallPortionOffered(portionRule, weights[carbsChoiceId]);
  const offersSecondSmallPortion = secondChoiceId !== undefined
    && smallPortionOffered(portionRule, weights[secondChoiceId]);
  // The same grades under their own heading, and under an id of their own: sharing the carbs
  // question's id would put both groups on one radio name, where picking a second grade would
  // clear the first.
  const secondSourceQuestion: Question = {
    ...carbsQuestion, id: "carbs_second", text: SECOND_SOURCE_TITLE, meal_qualifier: undefined,
    choices: carbsQuestion.choices.filter((choice) => choice.id !== NO_CARBS_CHOICE),
  };
  // What the form currently says the plate's second source is: a picked grade makes one, an open
  // but unanswered group does not.
  const secondSource: CarbSource | null = secondChoiceId === undefined ? null
    : { carbs_choice: secondChoiceId,
        small_portion: offersSecondSmallPortion && secondSmallPortion };
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
        || secondChoiceId !== undefined || mealTime !== pristineTime);

  // The meal inputs are the tallest thing here and are worth reading only when there is a meal to
  // report, so the tracker always opens on the day's figures and its recorded meals with the
  // inputs folded away behind them. Recording a meal or sending a correction folds the inputs
  // again, and opening a meal for editing unfolds them.
  const [formCollapsed, setFormCollapsed] = useState(true);

  // A day holding its full quota of meals folds the recording inputs away: the section's place is
  // taken by a completion note, and only correcting a recorded meal still opens the form. Deleting
  // a meal brings the day back under the quota and the toggle back with it.
  const atCap = today.meals.length >= maxMealsPerDay;

  // An overdue meal is called for from the fold rather than by opening the inputs uninvited: the
  // add-meal toggle blinks while it stands between the user and reporting the meal. Open inputs
  // silence the nudge, and so does a fresh meal arriving in the day's list; a day at its cap has
  // nothing left to call for.
  const nudging = !atCap && formCollapsed
    && mealOverdue(new Date(), firstMealHour, mealGapHours, today.meals);

  // Which beat of the blink schedule the nudge is on: 0 opens it, 1 presses harder, 2 settles into
  // the slow standing reminder. The schedule restarts whenever the nudge returns, so a re-folded
  // form gets the same escalation a fresh visit does.
  const [nudgePhase, setNudgePhase] = useState(0);
  useEffect(() => {
    if (!nudging) return;
    setNudgePhase(0);
    const escalations = [1, 2].map((phase) =>
      setTimeout(() => setNudgePhase(phase), phase * NUDGE_ESCALATION_MS));
    return () => escalations.forEach(clearTimeout);
  }, [nudging]);

  // Only reachable through the submit button, which renders only once a grade is picked and is
  // disabled while the picked time is still ahead of the clock.
  // Additions are sent in config order so the recorded list is deterministic.
  function submitMeal() {
    const meal: NewMeal = { at: localIso(atClockTime(new Date(), mealTime)),
                            carbs_choice: carbsChoiceId!, vegetables, fruit,
                            additions: carbsQuestion.additions!
                              .filter((a) => pickedAdditions.has(a.id)).map((a) => a.id),
                            small_portion: offersSmallPortion && smallPortion,
                            second_source: secondSource };
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
        || sourcesDiffer(secondSource, meal.second_source)
        || pickedAdditions.size !== meal.additions.length
        || meal.additions.some((id) => !pickedAdditions.has(id));
  }

  function clearSecondSource() {
    setSecondChoiceId(undefined);
    setSecondSmallPortion(false);
    setSecondSourceOpen(false);
  }

  function clearForm() {
    setCarbsChoiceId(undefined);
    setVegetables(false);
    setFruit(false);
    setPickedAdditions(new Set());
    setSmallPortion(false);
    clearSecondSource();
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
    setSecondChoiceId(meal.second_source === null ? undefined : meal.second_source.carbs_choice);
    setSecondSmallPortion(meal.second_source !== null && meal.second_source.small_portion);
    setSecondSourceOpen(meal.second_source !== null);
    setMealTime(clockTimeOf(meal.at));
    setEditingId(meal.id);
    setFormCollapsed(false);
  }

  return (
    <CollapsibleSection className="day-tracker" title="יומן היום" headerAside={headerAside}
                        summary={
      <DayDashboard questionnaire={questionnaire} derived={derived} />
    }>
      {/* Governs every grade name below it — the pickers' and the meal rows' alike — so it leads
          the tracker's contents rather than sitting inside either one. */}
      <div className="label-density">
        <button type="button" className="quiet" onClick={() => setExpandLabels(!expandLabels)}>
          {expandLabels ? COLLAPSE_LABELS : EXPAND_LABELS}
        </button>
      </div>
      {atCap && formCollapsed ? (
        <p className="meal-cap-note">{`הושלמו ${maxMealsPerDay} ארוחות היום`}</p>
      ) : (
      <CollapsibleSection className={"meal-form"
                            + (formCollapsed ? (nudging ? ` nudge-${nudgePhase}` : "") : " meal-form-open")}
                          headingLevel={3}
                          title={editing !== undefined ? "עדכון ארוחה" : "הוספת ארוחה"}
                          collapsed={formCollapsed}
                          onToggle={toggleForm}>
        {/* Sits in the frame's far corner via the style sheet rather than in the heading row:
            an aside there would restructure the header between open and folded, recreating the
            toggle mid-interaction and dropping keyboard focus with it. */}
        <button type="button" className="icon-only meal-form-close" aria-label="סגירת הטופס"
                onClick={toggleForm}>
          <Icon name="close" />
        </button>
        <CarbSourceFields question={carbsQuestion} selectedId={carbsChoiceId}
                          expandLabels={expandLabels}
                          portionLabel={carbsQuestion.small_portion!.label}
                          portionOffered={offersSmallPortion} smallPortion={smallPortion}
                          onPick={(id) => setCarbsChoiceId(id)}
                          onSmallPortion={setSmallPortion} />
        {secondSourceOpen && (
          <CarbSourceFields question={secondSourceQuestion} selectedId={secondChoiceId}
                            expandLabels={expandLabels}
                            portionLabel={carbsQuestion.small_portion!.label}
                            portionOffered={offersSecondSmallPortion}
                            smallPortion={secondSmallPortion}
                            onPick={(id) => setSecondChoiceId(id)}
                            onSmallPortion={setSecondSmallPortion} />
        )}
        {/* A plate carrying a second carb source is the exception, so the group is revealed on
            demand rather than standing open on every meal. */}
        <div className="form-actions">
          <button type="button" className="quiet"
                  onClick={() => (secondSourceOpen ? clearSecondSource() : setSecondSourceOpen(true))}>
            {secondSourceOpen ? SECOND_SOURCE_REMOVE : SECOND_SOURCE_ADD}
          </button>
        </div>
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
      )}
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
      <MealList questionnaire={questionnaire} meals={today.meals} expandLabels={expandLabels}
                onEdit={startEdit} onDelete={onDeleteMeal} deletingId={deletingMealId} />
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

// One carb source's inputs: its grade group, and under it the reduced-helping box the portion
// rule offers from its threshold up. The box belongs to the grade above it — a plate may carry two
// sources, and only this pairing says which grade a helping halves.
function CarbSourceFields({ question, selectedId, expandLabels, portionLabel, portionOffered,
                            smallPortion, onPick, onSmallPortion }: {
  question: Question;
  selectedId: string | undefined;
  expandLabels: boolean;
  portionLabel: string;
  portionOffered: boolean;
  smallPortion: boolean;
  onPick: (choiceId: string) => void;
  onSmallPortion: (checked: boolean) => void;
}) {
  return (
    <div className="carb-source">
      <ChoiceFieldset question={question} selectedId={selectedId} scope="meal"
                      expandLabels={expandLabels} onPick={(choice) => onPick(choice.id)} />
      {portionOffered && (
        <div className="meal-flags">
          <label>
            <input type="checkbox" checked={smallPortion}
                   onChange={(e) => onSmallPortion(e.target.checked)} />
            {" "}{portionLabel}
          </label>
        </div>
      )}
    </div>
  );
}

function minutesOfDay(at: Date): number {
  return at.getHours() * 60 + at.getMinutes();
}

// Whether two second-source readings disagree. Null stands for a plate that drew on one source,
// so a null matches only another null.
function sourcesDiffer(a: CarbSource | null, b: CarbSource | null): boolean {
  if (a === null || b === null) return a !== b;
  return a.carbs_choice !== b.carbs_choice || a.small_portion !== b.small_portion;
}

// "HH:MM" for a count of minutes since local midnight.
function clockTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:` +
    `${String(minutes % 60).padStart(2, "0")}`;
}

function defaultMealTime(now: Date): string {
  const minutes = minutesOfDay(now);
  return clockTime(minutes - minutes % TIME_STEP_MINUTES);
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
