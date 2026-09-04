import { useEffect, useRef, useState } from "react";
import { clockTimeOf, mealOverdue, parseIsoDate } from "../dates";
import { carbsScales, deriveDay, smallPortionOffered } from "../derive";
import { mayDiscardEdits } from "../edits";
import { isViolating } from "../violations";
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

// What the closed day's one control asks before undoing the close: adding a meal to a closed
// day means deleting its record — the same deletion the history table offers — and closing again
// over the fuller log.
const REOPEN_PROMPT = "האם לפתוח את חלון האכילה מחדש?";

// How long each of the nudge's escalating beats runs before the next takes over. The blink rate
// itself is the style sheet's, keyed by the phase the section's class carries.
const NUDGE_ESCALATION_MS = 10_000;

// The day's one journal: records meals at the time they were eaten, shows the day's derived
// values live, lists the day's meals for in-place correction or deletion, closes a fully
// tracked day by asking only for water, and holds a closed day read-only behind its reopen
// gate. Normally the day is today; during the small-hours grace window it is yesterday, still
// open for its late meals, its closing or its reopening. The dashboard and
// close-day values come from the vector-pinned client derivation twin, so they always agree with
// the meal list rendered beside them — the server re-derives on submit and stays the authority.
export function DayTracker({ questionnaire, day, isToday = true, closed = false, firstMealHour,
                             mealGapHours, maxMealsPerDay, closeMinWindowHours, onAddMeal,
                             onUpdateMeal, onDeleteMeal, deletingMealId, savingMeal, onCloseDay,
                             onReopenDay }: {
  questionnaire: Questionnaire;
  day: DayPayload;
  // False during the small-hours grace window, when the payload is the previous day's: the day
  // is over, so recorded times may run to its end, the overdue-meal nudge stays quiet, and the
  // title names yesterday.
  isToday?: boolean;
  // True once the day holds a submitted record: the tracker then shows the meals read-only and
  // one gated add-meal toggle whose confirmation calls onReopenDay.
  closed?: boolean;
  firstMealHour: number;
  mealGapHours: number;
  // Meals the day may hold — the same ceiling the API enforces.
  maxMealsPerDay: number;
  // Eating-window hours the recorded meals must span before closing is offered (app.json's
  // day_close.min_window_hours): anything narrower is a day still being eaten, whose figures
  // would close too early. A day under two meals derives a zero window, so it never reaches this
  // floor either — and with the tracker the only close, a day that never spans it stays
  // unrecorded.
  closeMinWindowHours: number;
  onAddMeal: (meal: NewMeal) => void;
  // Replaces the meal wholesale; a corrected time re-keys it, so the id is the one being replaced.
  onUpdateMeal: (id: string, meal: NewMeal) => void;
  onDeleteMeal: (id: string) => void;
  // The meal whose onDeleteMeal call is still in flight; its row's delete control locks meanwhile.
  deletingMealId?: string;
  // True while a saved meal is still round-tripping into the day's list; the close-day confirm
  // waits on it so the figures it submits count that meal.
  savingMeal?: boolean;
  onCloseDay: (answers: Record<string, number>) => void;
  // Deletes the closed day's record — the history table's own deletion path — so the day is open
  // to take the meal the user came to add. Supplied whenever closed can be true.
  onReopenDay?: () => void;
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
  // A running day opens the form on the clock rounded down to a five-minute mark; an already-over
  // day opens on its last such mark, the neighbourhood of the late meal being backfilled.
  const openingTime = () =>
    isToday ? defaultMealTime(new Date()) : clockTime(24 * 60 - TIME_STEP_MINUTES);
  const [mealTime, setMealTime] = useState(openingTime);
  // The time the form last opened on. Held rather than recomputed: the default walks with the
  // clock, and a freshly derived one would read ten minutes on as a time the user had picked.
  const [pristineTime, setPristineTime] = useState(mealTime);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [expandLabels, setExpandLabels] = useExpandedGradeLabels();

  // The day's meals always resolve against the current questionnaire, so deriveDay's throw on an
  // unknown id is a real config/data fault, not a legal state — let the error boundary show it.
  const { weights, additionValues, smallPortion: portionRule } = carbsScales(carbsQuestion);
  const derived = deriveDay(day.meals, weights, additionValues, portionRule);
  // Once recording one more meal would cross the meals rule's bound — from the third recorded
  // meal under the production config — every add-meal control carries the warning styling, so
  // the caution lands before that meal is recorded rather than through the history row after.
  const addMealWarns = isViolating(questionnaire, "meals", derived.meals + 1);
  const addMealTitle = addMealWarns
    ? <span className="meal-add-warn">הוספת ארוחה</span>
    : "הוספת ארוחה";
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
  const closable = derived.eating_window >= closeMinWindowHours;

  // A meal cannot have been eaten yet, so a running day's own clock caps the picker — both values
  // are zero-padded "HH:MM" on the same day, so they compare as strings. On the previous day every
  // hour has already passed, so nothing is future there.
  const nowTime = clockTime(minutesOfDay(new Date()));
  const mealTimeIsFuture = isToday && mealTime > nowTime;

  // The meal under correction can vanish beneath the form — deleted from the list mid-edit, or
  // from another tab — and the form then goes back to recording a new meal.
  const editing = day.meals.find((m) => m.id === editingId);

  // Whether the form still matches the meal it opened on — what separates an exit from a discard,
  // for the one button that serves as both.
  const editDiverged = editing !== undefined && formDiverged(editing);

  // A half-composed new meal is worth the same guard as a correction: the form holds the only copy
  // of it. Its baseline is the blank form recording opens on rather than a stored meal, and the
  // small-portion box is not among the terms because it exists only once a grade is picked.
  const newMealDiverged = editing === undefined
    && (carbsChoiceId !== undefined || vegetables || fruit || pickedAdditions.size > 0
        || secondChoiceId !== undefined || mealTime !== pristineTime);

  // Whether the form holds work only saving or cancelling can settle — a half-composed new meal
  // or a moved edit. The day cannot close over it: the figures would omit a meal that exists
  // nowhere else. A saveable one the close-day button saves itself and carries on; one not yet
  // saveable locks the button instead.
  const formHoldsUnsavedMeal = editDiverged || newMealDiverged;

  // The same terms that let the save button commit the form: a picked grade, at a time the clock
  // has reached.
  const mealSaveable = carbsChoiceId !== undefined && !mealTimeIsFuture;

  // The meal inputs are the tallest thing here and are worth reading only when there is a meal to
  // report, so the tracker always opens on the day's figures and its recorded meals with the
  // inputs folded away behind them. Recording a meal or sending a correction folds the inputs
  // again, and opening a meal for editing unfolds them.
  const [formCollapsed, setFormCollapsed] = useState(true);

  // A day holding its full quota of meals folds the recording inputs away: the section's place is
  // taken by a completion note, and only correcting a recorded meal still opens the form. Deleting
  // a meal brings the day back under the quota and the toggle back with it.
  const atCap = day.meals.length >= maxMealsPerDay;

  // An overdue meal is called for from the fold rather than by opening the inputs uninvited: the
  // add-meal toggle blinks while it stands between the user and reporting the meal. Open inputs
  // silence the nudge, and so does a fresh meal arriving in the day's list; a day at its cap has
  // nothing left to call for, and neither does the previous day — it is over, not running late.
  const nudging = isToday && !atCap && formCollapsed
    && mealOverdue(new Date(), firstMealHour, mealGapHours, day.meals);

  // The panel opens below the day's meal list, past the fold more often than not, so it walks
  // into view and hands focus to its first water choice rather than waiting to be found.
  const closePanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!closing || !closable) return;
    closePanel.current!.scrollIntoView({ behavior: "smooth", block: "nearest" });
    closePanel.current!.querySelector("input")!.focus();
  }, [closing, closable]);

  // The same instance stays mounted across the day's closing, so the close flow's state would
  // otherwise survive into a day reopened later; once the record lands closed, nothing is
  // mid-close anymore and the flow's panel and picked water reset with it.
  useEffect(() => {
    if (closed) {
      setClosing(false);
      setDrinkingChoiceId(undefined);
    }
  }, [closed]);

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
    const meal: NewMeal = { at: localIso(atClockTime(parseIsoDate(day.date), mealTime)),
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
    <CollapsibleSection className="day-tracker" title={isToday ? "יומן היום" : "יומן אתמול"}
                        summary={
      <DayDashboard questionnaire={questionnaire} derived={derived} />
    }>
      {closed ? (
        <>
          <div className="form-actions">
            <button type="button"
                    className={"quiet reopen-toggle" + (addMealWarns ? " meal-add-warn" : "")}
                    onClick={() => {
              if (!window.confirm(REOPEN_PROMPT)) return;
              // Pre-opened here: the same instance stays mounted through the deletion's round
              // trip, so the reopened day presents the inputs this click asked for.
              setFormCollapsed(false);
              onReopenDay!();
            }}>
              הוספת ארוחה
            </button>
            {/* The button undoes the close, so its effect stands spelled out beside it. */}
            <span className="reopen-hint">(פתיחת חלון האכילה)</span>
          </div>
          {/* The recorded meals stay readable, as in the history table's day view, but carry no
              controls: correcting one starts with reopening the day. */}
          <MealList questionnaire={questionnaire} meals={day.meals} expandLabels={expandLabels} />
        </>
      ) : (
        <>
      {/* The day's record leads the panel, the form for the next meal below it — so the row just
          saved sits right above the toggle that recorded it. */}
      <MealList questionnaire={questionnaire} meals={day.meals} expandLabels={expandLabels}
                onEdit={startEdit} onDelete={onDeleteMeal} deletingId={deletingMealId} />
      {atCap && formCollapsed ? (
        <p className="meal-cap-note">{`הושלמו ${maxMealsPerDay} ארוחות היום`}</p>
      ) : (
      <CollapsibleSection className={"meal-form"
                            + (formCollapsed ? (nudging ? ` nudge-${nudgePhase}` : "") : " meal-form-open")}
                          headingLevel={3}
                          title={editing !== undefined ? "עדכון ארוחה" : addMealTitle}
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
        {/* A meal still being composed would go with the closed day — the tracker goes with it —
            so closing folds it in rather than stopping over it: a saveable meal is saved by this
            very click and the flow continues into the panel. Only a meal the form cannot save yet
            holds the button, with the notice below saying why. Once the panel is open the button
            leaves: the flow runs forward to the confirmation, not back through a toggle. */}
        {closable && !closing && (
          <button type="button" className="quiet"
                  disabled={formHoldsUnsavedMeal && !mealSaveable}
                  onClick={() => {
                    if (formHoldsUnsavedMeal) submitMeal();
                    setClosing(true);
                  }}>
            סגירת יום
          </button>
        )}
      </div>
      {closable && formHoldsUnsavedMeal && (!mealSaveable || closing) && (
        <p className="notice">יש לשמור או לבטל את הארוחה שבטופס לפני סגירת היום</p>
      )}
      {/* Deleting or correcting a meal mid-close can narrow the day back under the window that
          offered closing, and the panel folds away with that button. */}
      {closing && closable && (
        <div className="close-day" ref={closePanel}>
          {/* The button that opened the panel is gone by now, so the panel names the step
              itself — the water question alone would read as a stray form. */}
          <h3 className="close-day-banner">השלב האחרון בסגירת היום</h3>
          <ChoiceFieldset question={drinkingQuestion} selectedId={drinkingChoiceId}
                          onPick={(choice) => setDrinkingChoiceId(choice.id)} />
          {/* The opening button cannot cover a meal whose composing began after this panel was
              already open, so the confirm holds the same line — and it also waits out a saved
              meal's round trip, or the figures below would close without it. */}
          <button type="button"
                  disabled={drinkingChoiceId === undefined || formHoldsUnsavedMeal || savingMeal}
                  onClick={() => onCloseDay({ ...derived,
                    drinking: drinkingQuestion.choices.find((c) => c.id === drinkingChoiceId)!.value })}>
            אישור וסגירה
          </button>
        </div>
      )}
        </>
      )}
      {/* Governs every grade name above it — the pickers' and the meal rows' alike, the closed
          day's read-only rows included — sitting outside either branch. It closes the card as a
          quiet setting rather than leading it as if it were the day's first control. */}
      <div className="label-density">
        <button type="button" className="quiet" onClick={() => setExpandLabels(!expandLabels)}>
          {expandLabels ? COLLAPSE_LABELS : EXPAND_LABELS}
        </button>
      </div>
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
