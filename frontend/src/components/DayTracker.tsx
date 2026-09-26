import { useEffect, useRef, useState, type ReactNode } from "react";
import { beforeDayStart, clockTimeOf, mealInstant, mealOverdue, mealTooSoon, nextMealNear } from "../dates";
import { carbsScales, deriveDay, portionOffered } from "../derive";
import { mayDiscardEdits } from "../edits";
import { isViolating } from "../violations";
import type { CarbSource, DayPayload, Meal, MealAddition, NewMeal, Question,
              Questionnaire, TreatDaySettings } from "../types";
import { ChoiceFieldset } from "./ChoiceFieldset";
import { CollapsibleSection } from "./CollapsibleSection";
import { DayDashboard } from "./DayDashboard";
import { Icon } from "./Icon";
import { FAT_SERVINGS, FRUIT_FLAG, VEGETABLES_FLAG } from "../mealMarkers";
import { useReveal } from "../reveal";
import { MealList } from "./MealList";
import { ScoreBreakdown } from "./ScoreBreakdown";

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

// The least the program spaces meals apart: until this long after the last one, the add-meal
// toggle reads greyed, a quieter caution than the overdue nudge on the far side of the gap.
const MIN_MEAL_GAP_HOURS = 3.5;

// What the closed day's controls ask before undoing the close: adding a meal to a closed day, or
// correcting its last one, means deleting its record — the same deletion the history table
// offers — and closing again over the corrected log.
const REOPEN_PROMPT = "האם לפתוח את חלון האכילה מחדש?";

// How long each of the nudge's escalating beats runs before the next takes over. The blink rate
// itself is the style sheet's, keyed by the phase the section's class carries.
const NUDGE_ESCALATION_MS = 10_000;

// How long the fat-serving hint stays after the box is ticked: long enough to read the list of
// what counts as one serving, then gone so the form is back to its controls.
const FAT_HINT_MS = 30_000;

// The day's one journal: records meals at the time they were eaten, shows the day's derived
// values live, lists the day's meals for in-place correction or deletion, closes a fully
// tracked day by asking only for water, and holds a closed day read-only behind its reopen
// gate. Normally the day is today; during the small-hours grace window it is yesterday, still
// open for its late meals, its closing or its reopening. The dashboard and close-day values come
// from the client-side derivation, held to the server's by the shared test vectors in
// config/derive-vectors.json, so they always agree with the meal list rendered beside them — the
// server re-derives on submit and stays the authority.
export function DayTracker({ questionnaire, treatDay, day, expandLabels, isToday = true, closed = false, firstMealHour,
                             mealGapHours, maxMealsPerDay, closeMinWindowHours, closeFrom, stretchesUntil,
                             onAddMeal,
                             onUpdateMeal, onDeleteMeal, deletingMealId, savingMeal, onCloseDay,
                             onReopenDay, onRecommend, suggestBeforeHours }: {
  questionnaire: Questionnaire;
  // The weekday whose breaches the dashboard paints softer.
  treatDay: TreatDaySettings;
  day: DayPayload;
  // How much of a grade's name the card spells out — the pickers' and the meal rows' alike, the
  // closed day's read-only rows included. The account menu holds the switch, so the density
  // arrives set rather than being the tracker's to keep.
  expandLabels: boolean;
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
  // floor.
  closeMinWindowHours: number;
  // Evening "HH:MM" (day_close.close_from) from which a day holding any meal closes whatever its
  // window: a short eating day is a legitimate day once the evening is in. A yesterday still on
  // screen in the small hours is past this bound by definition.
  closeFrom: string;
  // Small-hours "HH:MM" an eating day runs to past midnight (day_close.close_until): the bound
  // that tells a late-night pick on the previous day's log from an early-morning one.
  stretchesUntil: string;
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
  // to take the meal the user came to add or correct. Supplied whenever closed can be true.
  onReopenDay?: () => void;
  // Asks the chat for the next meal on the user's behalf; absent on a deployment with no
  // answering service, which also has no chat.
  onRecommend?: () => void;
  // Hours before the next meal is due from which the recommendation reads as timely
  // (app.json's next_meal.suggest_before_hours).
  suggestBeforeHours: number;
}) {
  const carbsQuestion = questionnaire.questions.find((q) => q.id === "carbs")!;
  const fatQuestion = questionnaire.questions.find((q) => q.id === "fat")!;
  const drinkingQuestion = questionnaire.questions.find((q) => q.id === "drinking")!;
  const { weights, additionValues, amounts: amountRule, portions: portionRule,
          secondSource: secondRule, excluded: excludedRule } = carbsScales(carbsQuestion);
  // The fullest helping the scale offers — the default either portion picker opens on, so an
  // unconsidered save never under-prices the plate.
  const defaultPortionId =
    portionRule.options.reduce((a, b) => (b.percent > a.percent ? b : a)).id;
  // A recorded addition's amount as the form holds it: one carrying none opens on the routine
  // step its surcharge prices.
  const recordedAmount = (addition: MealAddition) => addition.amount ?? amountRule.default;
  const [carbsChoiceId, setCarbsChoiceId] = useState<string | undefined>(undefined);
  const [vegetables, setVegetables] = useState(false);
  const [fruit, setFruit] = useState(false);
  // Concentrated-fat servings of the meal being recorded; ticking the box records one.
  const [fatServings, setFatServings] = useState(0);
  // The moment the fat-serving hint is showing, opened by a tick of its box.
  const fatHint = useReveal<true>();
  // The additions checked for the meal being recorded, each with the amount it was eaten at.
  const [pickedAdditions, setPickedAdditions] = useState<Map<string, string>>(new Map());
  const [portionId, setPortionId] = useState(defaultPortionId);
  const [secondChoiceId, setSecondChoiceId] = useState<string | undefined>(undefined);
  const [secondPortionId, setSecondPortionId] = useState(defaultPortionId);
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
  // The whole tracker's fold, distinct from the meal form's below. Neither answers to the
  // menu's view command: the tracker is the page's working surface, so even the condensed view
  // leaves it open, and only its own toggle folds it.
  const [sectionCollapsed, setSectionCollapsed] = useState(false);
  // Whether the score's breakdown stands in for the meal list and form. It shows only while the
  // score is past the day rule — the link that opens it is offered from nothing less — so a
  // correction that brings the day back under the rule returns the log without a close.
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  // The day's meals always resolve against the current questionnaire, so deriveDay's throw on an
  // unknown id is a real config/data fault, not a legal state — let the error boundary show it.
  const derived = deriveDay(day.meals, weights, additionValues, amountRule, portionRule,
                            secondRule, excludedRule);
  // Once recording one more meal would cross the meals rule's bound — from the third recorded
  // meal under the production config — every add-meal control carries the warning styling, so
  // the caution lands before that meal is recorded rather than through the history row after.
  const addMealWarns = isViolating(questionnaire, "meals", derived.meals + 1);
  const breakdownShown = breakdownOpen && isViolating(questionnaire, carbsQuestion.id, derived.carbs);
  const addMealTitle = addMealWarns
    ? <span className="meal-add-warn">הוספת ארוחה</span>
    : "הוספת ארוחה";
  // The lighter grades are not worth splitting by helping, so the picker appears only where it
  // moves the score — and the helping goes with it, so a grade switched down cannot leave a
  // reduced one stuck on.
  const offersPortion = carbsChoiceId !== undefined
    && portionOffered(portionRule, weights[carbsChoiceId]);
  // A second source rides only on a light primary grade — the same bound the API enforces — and
  // never on a no-carb plate, whose only carb would simply be the primary.
  const allowsSecond = (choiceId: string) =>
    weights[choiceId] > 0 && weights[choiceId] <= secondRule.light_grade_max;
  const offersSecondSource = carbsChoiceId !== undefined && allowsSecond(carbsChoiceId);
  // A light second grade merges into the plate and records no helping; only a heavier one asks
  // which helping it was.
  const secondIsHeavy = secondChoiceId !== undefined
    && weights[secondChoiceId] > secondRule.light_grade_max;
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
    : { carbs_choice: secondChoiceId, portion: secondIsHeavy ? secondPortionId : null };
  // A second source in a form whose primary grade cannot carry one — the state a repick away from
  // the light grades leaves behind. The plate is unrecordable while it holds, so the save is
  // barred until the user lowers the primary again or removes the source.
  const secondSourceBarred = secondSource !== null && !offersSecondSource;
  const nowTime = clockTime(minutesOfDay(new Date()));
  const pastEveningBound = !isToday || nowTime >= closeFrom;
  const closable = derived.eating_window >= closeMinWindowHours
    || (day.meals.length > 0 && pastEveningBound);
  // The instant the form would record, which is also what decides whether the picked time is
  // still ahead of the clock: on the previous day's log a small-hours pick is tonight's, so it
  // can be future there too.
  const mealAt = mealInstant(day.date, mealTime, isToday, stretchesUntil);
  const mealTimeIsFuture = Date.parse(mealAt) > Date.now();
  const mealTimeBeforeDay = beforeDayStart(mealTime, isToday, stretchesUntil);

  // The meal under correction can vanish beneath the form — deleted from the list mid-edit, or
  // from another tab — and the form then goes back to recording a new meal.
  const editing = day.meals.find((m) => m.id === editingId);

  // Whether the form still matches the meal it opened on — what separates an exit from a discard,
  // for the one button that serves as both.
  const editDiverged = editing !== undefined && formDiverged(editing);

  // A half-composed new meal is worth the same guard as a correction: the form holds the only copy
  // of it. Its baseline is the blank form recording opens on rather than a stored meal, and the
  // portion picker is not among the terms because it exists only once a grade is picked.
  const newMealDiverged = editing === undefined
    && (carbsChoiceId !== undefined || vegetables || fruit || fatServings > 0
        || pickedAdditions.size > 0
        || secondChoiceId !== undefined || mealTime !== pristineTime);

  // Whether the form holds work only saving or cancelling can settle — a half-composed new meal
  // or a moved edit. The day cannot close over it: the figures would omit a meal that exists
  // nowhere else. A saveable one the close-day button saves itself and carries on; one not yet
  // saveable locks the button instead.
  const formHoldsUnsavedMeal = editDiverged || newMealDiverged;

  // The same terms that let the save button commit the form: a picked grade, at a time the clock
  // has reached and that falls inside the open day, over a plate the second-source contract
  // admits.
  const mealSaveable = carbsChoiceId !== undefined && !mealTimeIsFuture && !mealTimeBeforeDay
    && !secondSourceBarred;

  // The meal inputs are the tallest thing here and are worth reading only when there is a meal to
  // report, so the tracker always opens on the day's figures and its recorded meals with the
  // inputs folded away behind them. Every way out of the form — saving it or abandoning it —
  // folds the inputs again, and opening a meal for editing unfolds them.
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

  // The opposite caution: a meal that would land too close after the last one greys the folded
  // toggle. Open inputs are already recording, so the shade lifts with them.
  const tooSoon = formCollapsed && mealTooSoon(new Date(), MIN_MEAL_GAP_HOURS, day.meals);

  // The recommendation button reads greyed until the next meal is within the configured lead.
  const suggestionTimely = nextMealNear(new Date(), firstMealHour, mealGapHours,
                                        suggestBeforeHours, day.meals);

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
  // disabled unless mealSaveable above holds.
  // Additions are sent in config order so the recorded list is deterministic.
  function submitMeal() {
    const meal: NewMeal = { at: mealAt,
                            carbs_choice: carbsChoiceId!, vegetables, fruit,
                            fat_servings: fatServings,
                            additions: carbsQuestion.additions!
                              .filter((a) => pickedAdditions.has(a.id))
                              .map((a) => ({ id: a.id, amount: pickedAdditions.get(a.id)! })),
                            portion: offersPortion ? portionId : null,
                            second_source: secondSource };
    if (editing !== undefined) onUpdateMeal(editing.id, meal);
    else onAddMeal(meal);
    clearForm();
  }

  // Both ways to abandon an open form — its cancel button and folding it away — spend what the
  // form holds, so both ask through the shared discard guard. A dismissed dialog keeps the form
  // open around what it refused to throw away.
  function discardForm() {
    if (!mayDiscardEdits(editDiverged || newMealDiverged)) return;
    clearForm();
  }

  function toggleForm() {
    if (formCollapsed) setFormCollapsed(false);
    else discardForm();
  }

  function formDiverged(meal: Meal): boolean {
    return carbsChoiceId !== meal.carbs_choice
        || vegetables !== meal.vegetables
        || fruit !== meal.fruit
        || fatServings !== meal.fat_servings
        || mealTime !== clockTimeOf(meal.at)
        || (offersPortion ? portionId : null) !== meal.portion
        || sourcesDiffer(secondSource, meal.second_source)
        || pickedAdditions.size !== meal.additions.length
        || meal.additions.some((a) => pickedAdditions.get(a.id) !== recordedAmount(a));
  }

  // Both carb sources ask the same helping question off the same scale, so one control renders
  // for whichever source currently offers it.
  function portionPicker(value: string, onPick: (id: string) => void) {
    return (
      <div className="meal-flags">
        <label>
          גודל המנה{" "}
          <select value={value} onChange={(e) => onPick(e.target.value)}>
            {portionRule.options.map((portion) => (
              <option key={portion.id} value={portion.id}>{portion.label}</option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  function clearSecondSource() {
    setSecondChoiceId(undefined);
    setSecondPortionId(defaultPortionId);
    setSecondSourceOpen(false);
  }

  // The form is only ever cleared on the way out — a save or an abandoned form — so its contents
  // and the open inputs go together.
  function clearForm() {
    setCarbsChoiceId(undefined);
    setVegetables(false);
    setFruit(false);
    setFatServings(0);
    setPickedAdditions(new Map());
    setPortionId(defaultPortionId);
    clearSecondSource();
    const opensOn = openingTime();
    setMealTime(opensOn);
    setPristineTime(opensOn);
    setEditingId(undefined);
    setFormCollapsed(true);
  }

  // Corrections run through the recording form, so a stored meal becomes the form's contents:
  // everything settable while recording is settable while correcting, the time included.
  function startEdit(meal: Meal) {
    setCarbsChoiceId(meal.carbs_choice);
    setVegetables(meal.vegetables);
    setFruit(meal.fruit);
    setFatServings(meal.fat_servings);
    setPickedAdditions(new Map(meal.additions.map((a) => [a.id, recordedAmount(a)])));
    setPortionId(meal.portion === null ? defaultPortionId : meal.portion);
    setSecondChoiceId(meal.second_source === null ? undefined : meal.second_source.carbs_choice);
    setSecondPortionId(meal.second_source === null || meal.second_source.portion === null
      ? defaultPortionId : meal.second_source.portion);
    setSecondSourceOpen(meal.second_source !== null);
    setMealTime(clockTimeOf(meal.at));
    setEditingId(meal.id);
    setFormCollapsed(false);
  }

  return (
    <CollapsibleSection className="day-tracker" title={isToday ? "יומן היום" : "יומן אתמול"}
                        collapsed={sectionCollapsed}
                        onToggle={() => setSectionCollapsed((c) => !c)}
                        summary={
      <>
        <DayDashboard questionnaire={questionnaire} treatDay={treatDay} date={day.date} derived={derived}
                      // From a folded tracker the score opens the breakdown into view rather than
                      // toggling a panel the fold would hide.
                      onScoreClick={() => {
                        setBreakdownOpen(sectionCollapsed || !breakdownOpen);
                        setSectionCollapsed(false);
                      }} />
        {/* The fold hides the day's controls, not its record: the meals stay readable under the
            strip, as in the history table's day view, and opening the journal brings their
            controls back. */}
        {sectionCollapsed && day.meals.length > 0 && (
          <MealList questionnaire={questionnaire} meals={day.meals} expandLabels={expandLabels} />
        )}
      </>
    }>
      {breakdownShown ? (
        <ScoreBreakdown questionnaire={questionnaire} treatDay={treatDay} date={day.date} meals={day.meals}
                        onExpire={() => setBreakdownOpen(false)} />
      ) : closed ? (
        <>
          <div className="form-actions">
            <button type="button"
                    className={"secondary reopen-toggle" + (addMealWarns ? " meal-add-warn" : "")}
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
          {/* The recorded meals stay readable, as in the history table's day view. Only the last
              one can still be corrected, behind the same reopen question as adding a meal: the
              form takes the meal before the deletion's round trip, so the reopened day comes back
              already correcting it. Nothing on a closed day deletes a meal. */}
          <MealList questionnaire={questionnaire} meals={day.meals} expandLabels={expandLabels}
                    editLastOnly onEdit={(meal) => {
                      if (!window.confirm(REOPEN_PROMPT)) return;
                      startEdit(meal);
                      onReopenDay!();
                    }} />
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
                            + (formCollapsed ? (nudging ? ` nudge-${nudgePhase}` : "") : " meal-form-open")
                            + (tooSoon ? " meal-add-early" : "")}
                          headingLevel={3}
                          title={editing !== undefined ? "עדכון ארוחה" : addMealTitle}
                          collapsed={formCollapsed}
                          onToggle={toggleForm}
                          headerAside={
      /* The next meal's recommendation rides beside the add-meal heading, the question it
         answers, greyed until the next meal is within the configured lead. It shows only while
         the form is folded: open inputs are already composing that meal, or correcting a past
         one. The header keeps its aside slot either way — an empty aside, not a missing one —
         so opening the form does not restructure the header and remount the toggle mid-press. */
      onRecommend === undefined || !isToday
        ? undefined
        : !formCollapsed
          ? null
          : <button type="button" onClick={onRecommend}
                    className={"secondary compact next-meal" + (suggestionTimely ? "" : " next-meal-early")}>
              מה לאכול בארוחה הבאה?
            </button>
    }>
        {/* Sits in the frame's far corner via the style sheet rather than in the heading row:
            an aside there would restructure the header between open and folded, recreating the
            toggle mid-interaction and dropping keyboard focus with it. */}
        <button type="button" className="glyph meal-form-close" aria-label="סגירת הטופס"
                onClick={toggleForm}>
          <Icon name="close" />
        </button>
        <CarbSourceFields question={carbsQuestion} selectedId={carbsChoiceId}
                          expandLabels={expandLabels}
                          onPick={(id) => setCarbsChoiceId(id)}>
          {offersPortion && portionPicker(portionId, setPortionId)}
        </CarbSourceFields>
        {secondSourceOpen && (
          <CarbSourceFields question={secondSourceQuestion} selectedId={secondChoiceId}
                            expandLabels={expandLabels}
                            onPick={(id) => setSecondChoiceId(id)}>
            {secondIsHeavy && portionPicker(secondPortionId, setSecondPortionId)}
          </CarbSourceFields>
        )}
        {/* A plate carrying a second carb source is the exception, so the group is revealed on
            demand — and offered only beside a light primary grade, the one place the contract
            admits one. An open group outlives every repick: this control is the only way one
            goes, so correcting the primary never discards a source the user recorded. */}
        {(offersSecondSource || secondSourceOpen) && (
          <div className="form-actions">
            <button type="button" className="secondary"
                    onClick={() => (secondSourceOpen ? clearSecondSource() : setSecondSourceOpen(true))}>
              {secondSourceOpen ? SECOND_SOURCE_REMOVE : SECOND_SOURCE_ADD}
            </button>
          </div>
        )}
        {/* What the meal held besides its carb source, each box named by the thing alone under
            the one heading that says it was included. */}
        <fieldset className="meal-flags">
          <legend>כולל</legend>
          <label>
            <input type="checkbox" checked={vegetables}
                   onChange={(e) => setVegetables(e.target.checked)} />
            {" "}{VEGETABLES_FLAG.label}
          </label>
          <label>
            <input type="checkbox" checked={fruit}
                   onChange={(e) => setFruit(e.target.checked)} />
            {" "}{FRUIT_FLAG.label}
          </label>
          <label>
            <input type="checkbox" checked={fatServings > 0}
                   onChange={(e) => {
                     setFatServings(e.target.checked ? 1 : 0);
                     if (e.target.checked) fatHint.reveal(true, FAT_HINT_MS);
                   }} />
            {" "}{FAT_SERVINGS.label}
            {/* The count rides inside the label like an addition's amount, and appears only once
                there is a serving to count: ticking the box is the one-serving case. */}
            {fatServings > 0 && (
              <select className="addition-amount" aria-label={`מנות — ${FAT_SERVINGS.label}`}
                      value={fatServings} onChange={(e) => setFatServings(Number(e.target.value))}>
                {Array.from({ length: fatQuestion.per_meal_max! }, (_, n) => (
                  <option key={n + 1} value={n + 1}>{n + 1}</option>
                ))}
              </select>
            )}
          </label>
          {/* What one serving is, from the config, on its own line right under the box that asks
              for the count — shown for a moment after each tick, as a just-picked grade's list
              is, and withdrawn with the serving if the box is cleared before then. */}
          {fatServings > 0 && fatHint.revealed !== null && (
            <p className="meal-hint revealed" style={fatHint.style}>{fatQuestion.tooltip}</p>
          )}
          {carbsQuestion.additions!.map((addition) => (
            <label key={addition.id}>
              <input type="checkbox" checked={pickedAdditions.has(addition.id)}
                     onChange={(e) => setPickedAdditions((prev) => {
                       const next = new Map(prev);
                       if (e.target.checked) next.set(addition.id, amountRule.default);
                       else next.delete(addition.id);
                       return next;
                     })} />
              {" "}{addition.label}
              {/* The amount rides inside the addition's own label, so it reads as part of that
                  one accompaniment and appears only once there is something to quantify. */}
              {pickedAdditions.has(addition.id) && (
                <select className="addition-amount" aria-label={`כמות — ${addition.label}`}
                        value={pickedAdditions.get(addition.id)}
                        onChange={(e) => setPickedAdditions((prev) =>
                          new Map(prev).set(addition.id, e.target.value))}>
                  {amountRule.options.map((amount) => (
                    <option key={amount.id} value={amount.id}>{amount.label}</option>
                  ))}
                </select>
              )}
            </label>
          ))}
        </fieldset>
        <label className="meal-time">
          שעת הארוחה{" "}
          <input type="time" value={mealTime} min={isToday ? stretchesUntil : undefined}
                 max={isToday ? nowTime : undefined}
                 onChange={(e) => setMealTime(e.target.value)} />
        </label>
      </CollapsibleSection>
      )}
      {/* Sit outside the fold that hides the picker: they are the only account of why the submit
          button is disabled, and that button shows either way. */}
      {mealTimeIsFuture && <p className="notice">לא ניתן לרשום ארוחה בשעה עתידית</p>}
      {mealTimeBeforeDay && (
        <p className="notice">שעה זו שייכת ליום הקודם — ניתן לרשום אותה ביומן אתמול</p>
      )}
      {secondSourceBarred && (
        <p className="notice">
          {`מקור פחמימה נוסף מותר רק לצד דרגה קלה — עד דרגה ${secondRule.light_grade_max}`}
        </p>
      )}
      <div className="form-actions">
        {carbsChoiceId !== undefined && formHoldsUnsavedMeal && (
          <button type="button" className="primary" disabled={!mealSaveable} onClick={submitMeal}>
            שמירת ארוחה
          </button>
        )}
        {/* An open form always offers a way out in the actions row, recording and correcting
            alike: a plain close while the form holds nothing, a destructive discard once it
            diverges. The corner icon above is the same action in icon form. */}
        {!formCollapsed && (
          <button type="button" className={formHoldsUnsavedMeal ? "secondary destructive" : "secondary"}
                  onClick={discardForm}>
            {formHoldsUnsavedMeal ? "ביטול שינויים"
              : editing !== undefined ? "יציאה מעריכה" : "סגירת הטופס"}
          </button>
        )}
        {/* A meal still being composed would go with the closed day — the tracker goes with it —
            so closing folds it in rather than stopping over it: a saveable meal is saved by this
            very click and the flow continues into the panel. Only a meal the form cannot save yet
            holds the button, with the notice below saying why. Once the panel is open the button
            leaves: the flow runs forward to the confirmation, not back through a toggle. */}
        {closable && !closing && (
          <button type="button" className="secondary"
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
          <button type="button" className="primary"
                  disabled={drinkingChoiceId === undefined || formHoldsUnsavedMeal || savingMeal}
                  onClick={() => onCloseDay({ ...derived,
                    drinking: drinkingQuestion.choices.find((c) => c.id === drinkingChoiceId)!.value })}>
            אישור וסגירה
          </button>
        </div>
      )}
        </>
      )}
    </CollapsibleSection>
  );
}

// One carb source's inputs: its grade group, and under it whatever quantity control that source
// carries — the main grade's small-portion box, or a heavy second source's helping picker. The
// control belongs to the grade above it, so this pairing is what says which grade it reduces.
function CarbSourceFields({ question, selectedId, expandLabels, onPick, children }: {
  question: Question;
  selectedId: string | undefined;
  expandLabels: boolean;
  onPick: (choiceId: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="carb-source">
      <ChoiceFieldset question={question} selectedId={selectedId} scope="meal"
                      expandLabels={expandLabels} onPick={(choice) => onPick(choice.id)} />
      {children}
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
  return a.carbs_choice !== b.carbs_choice || a.portion !== b.portion;
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
