import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayTracker } from "./DayTracker";
import type { DayPayload } from "../types";
import { STORAGE_KEY as GRADE_LABELS_KEY } from "../gradeLabels";
import { dashboardFigure, trackedDay, trackerQuestionnaire as questionnaire } from "../test-fixtures";

const emptyDay: DayPayload = {
  date: "2026-08-20", meals: [],
  derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0, fat: 0 },
};

// A day whose single meal was recorded the given number of hours before the test runs.
const dayWithMealHoursAgo = (hours: number): DayPayload => ({
  date: "2026-08-20",
  meals: [{ id: "m", at: new Date(Date.now() - hours * 3_600_000).toISOString(),
            carbs_choice: "no_carbs", vegetables: false, fruit: false, fat_servings: 0, additions: [], portion: null, second_source: null }],
  derived: { carbs: 0, meals: 1, vegetables: 0, eating_window: 0, fat: 0 },
});

// trackedDay with a derived copy that contradicts its meals: the tracker must recompute from
// the meals it renders rather than trust the payload's copy.
const staleDerivedDay: DayPayload = {
  ...trackedDay,
  derived: { carbs: 99, meals: 9, vegetables: 9, eating_window: 9, fat: 0 },
};

// A day wide enough to offer close-day: trackedDay's first meal pushed back into the morning for
// a 6.5-hour span the derivation reports as 7 whole hours, keeping the contradictory derived
// copy so the recomputation stays under test.
const wideWindowDay: DayPayload = {
  ...staleDerivedDay,
  meals: [{ ...trackedDay.meals[0], at: "2026-08-20T07:00:00+03:00" }, trackedDay.meals[1]],
};

// trackedDay plus a third meal: the smallest log where recording another meal would cross the
// meals rule's bound.
const threeMealDay: DayPayload = {
  ...trackedDay,
  meals: [...trackedDay.meals,
          { id: "c", at: "2026-08-20T17:00:00+03:00", carbs_choice: "no_carbs", vegetables: false,
            fruit: false, fat_servings: 0, additions: [], portion: null, second_source: null }],
  derived: { carbs: 4, meals: 3, vegetables: 1, eating_window: 8, fat: 0 },
};

// Pins the clock: the meal form's default time is derived from it, as are the future-time guard
// on the submit button, the hour that starts the add-meal nudge on an unrecorded day, and the
// evening bound that opens close-day whatever the eating window — so cases about the window
// gate pin an afternoon, and every other case runs on the noon the describe pins.
const atLocalTime = (hour: number, minute = 0, day = 20) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, day, hour, minute));
};

// trackedDay and the days built from it fall on 2026-08-20, a Thursday, under a Friday treat day.
const TREAT_DAY = { weekday: "FRI" };

// Past every hour a clock can report, so cases not about the first-meal nudge always arrive
// with a quiet toggle, whatever hour they pin — or leave unpinned.
const NO_NUDGE_HOUR = 24;

// The app's own day_close.close_until: how far past midnight a day's log keeps running.
const STRETCHES_UNTIL = "02:00";

// The app's own day_close.close_from: the evening hour from which a day closes whatever its
// eating window.
const CLOSE_FROM = "20:00";

// Longer than any gap a clock can open, so cases not about the stale-meal nudge always arrive
// with a quiet toggle, however old the day fixture's meals are.
const NO_NUDGE_GAP_HOURS = Infinity;

// Higher than any fixture day's meal list, so cases not about the daily cap never fold the
// recording inputs away.
const NO_CAP_MEALS = Infinity;

// The meal-form section, read off its toggle: where the nudge and too-soon classes land.
const mealFormSection = () =>
  screen.getByRole("button", { name: "הוספת ארוחה" }).closest("section")!;

// The meal inputs start folded, so a test that reaches them opens the section first.
const openMealForm = () =>
  fireEvent.click(screen.getByRole("button", { name: "הוספת ארוחה" }));

// Both grade groups offer the same choices, so a query has to say which plate source it means.
const secondSourceGroup = () => within(screen.getByRole("group", { name: "מקור פחמימה נוסף" }));
const primaryGroup = () => within(screen.getByRole("group", { name: "פחמימות (דרגת הארוחה)" }));
const revealSecondSource = () =>
  fireEvent.click(screen.getByRole("button", { name: "הוספת מקור פחמימה נוסף" }));

describe("DayTracker", () => {
  // The label density is remembered per browser, so a case that changes it would set the density
  // every later case opens on.
  afterEach(() => window.localStorage.clear());

  // Cases here spy on window.confirm; without a restore the spy and its call log outlive the case
  // that installed it, and a later one reads another case's dialog answer as its own.
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  // A running day's log starts at STRETCHES_UNTIL, so a form opened on the wall clock in the small
  // hours defaults to a time before the day began and cannot save. Pinning noon keeps every case
  // off that bound whatever hour the suite runs; cases about the clock pin their own.
  beforeEach(() => atLocalTime(12));

  // Grade labels open spelled out by default, while the cases here read grades by their short
  // names; pinning the trimmed density keeps those readings stable, and the default itself is
  // asserted by the case that clears this pin.
  beforeEach(() => window.localStorage.setItem(GRADE_LABELS_KEY, "false"));

  it("starts expanded on an empty day whatever the hour", () => {
    atLocalTime(9);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "יומן היום" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("starts expanded however recently the last meal was recorded", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={dayWithMealHoursAgo(1)}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "יומן היום" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("derives the dashboard from the recorded meals, not the payload's derived copy", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={staleDerivedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(dashboardFigure("ציון")).toHaveTextContent("ציון: 4");
    expect(dashboardFigure("ירקות")).toHaveTextContent("ירקות: 1");
    expect(dashboardFigure("חלון")).toHaveTextContent("חלון: 5 שעות");
    // The meals are listed right under the strip, so their count is not a figure of it.
    expect(screen.queryByText(/ארוחות:/)).toBeNull();
  });

  it("close-day submits values derived from the recorded meals", () => {
    const onCloseDay = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={wideWindowDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={onCloseDay} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    fireEvent.click(screen.getByRole("button", { name: "אישור וסגירה" }));
    expect(onCloseDay).toHaveBeenCalledWith({
      carbs: 4, meals: 2, vegetables: 1, eating_window: 7, fat: 0, drinking: 3 });
  });

  // trackedDay's two meals span under the six-hour window, so only the clock can open its close.
  const renderShortWindowDay = (isToday?: boolean) =>
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       isToday={isToday} firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);

  it("withholds close-day from a short-window day before the evening bound", () => {
    atLocalTime(19, 59);
    renderShortWindowDay();
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();
  });

  it("offers close-day to a short-window day once the clock reaches the evening bound", () => {
    atLocalTime(20);
    renderShortWindowDay();
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
  });

  it("offers close-day to a short-window yesterday during the small-hours grace window", () => {
    atLocalTime(1, 0, 21);
    renderShortWindowDay(false);
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
  });

  it("withholds close-day from a day without meals however late the clock", () => {
    atLocalTime(21);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();
  });

  it("renders each meal's time in bold", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const time = screen.getByText("09:10");
    expect(time.tagName).toBe("STRONG");
  });

  it("titles the per-meal carbs picker with the meal-level text, not the score summary", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    expect(screen.getByText("פחמימות (דרגת הארוחה)")).toBeInTheDocument();
    expect(screen.queryByText("ציון יומי")).toBeNull();
  });

  it("records a meal with the picked grade, vegetables, fruit and additions", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    expect(screen.queryByRole("button", { name: "שמירת ארוחה" })).toBeNull();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.click(screen.getByLabelText("כולל ירקות"));
    fireEvent.click(screen.getByLabelText("כולל פרי"));
    fireEvent.click(screen.getByLabelText("כולל מתוק"));
    fireEvent.click(screen.getByLabelText("כולל אלכוהול לא יבש"));
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({
      carbs_choice: "carb_grade_4", vegetables: true, fruit: true,
      fat_servings: 0, additions: [{ id: "sweet", amount: "regular" }, { id: "alcohol", amount: "regular" }],
      portion: null, second_source: null }));
    // Carries a UTC offset — the test runs on an arbitrary real date, with the clock unpinned.
    expect(onAddMeal.mock.calls[0][0].at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it("records each checked addition at the amount picked beside it", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    // The amount belongs to one addition, so it appears only once that addition is checked.
    expect(screen.queryByLabelText("כמות — כולל מתוק")).toBeNull();
    fireEvent.click(screen.getByLabelText("כולל מתוק"));
    fireEvent.click(screen.getByLabelText("כולל אלכוהול לא יבש"));
    fireEvent.change(screen.getByLabelText("כמות — כולל מתוק"), { target: { value: "little" } });
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({
      additions: [{ id: "sweet", amount: "little" }, { id: "alcohol", amount: "regular" }] }));
  });

  it("records one fat serving on a tick, more from the count beside it, and clears after saving", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    // The count and the serving hint appear only once there is a serving to count.
    expect(screen.queryByLabelText("מנות — כולל מנת שומן")).toBeNull();
    expect(screen.queryByText("מנת שומן = כף שמן")).toBeNull();
    fireEvent.click(screen.getByLabelText("כולל מנת שומן"));
    expect(screen.getByText("מנת שומן = כף שמן")).toBeInTheDocument();
    expect(screen.getByLabelText("מנות — כולל מנת שומן")).toHaveValue("1");
    fireEvent.change(screen.getByLabelText("מנות — כולל מנת שומן"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({ fat_servings: 3 }));
    openMealForm();
    expect(screen.getByLabelText("כולל מנת שומן")).not.toBeChecked();
  });

  it("opens a recorded meal's servings for correction and unticking drops them", () => {
    const onUpdateMeal = vi.fn();
    const servingsDay: DayPayload = {
      ...trackedDay,
      meals: [{ ...trackedDay.meals[0], fat_servings: 2 }, trackedDay.meals[1]],
      derived: { ...trackedDay.derived, fat: 2 },
    };
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={servingsDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={onUpdateMeal}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 09:10" }));
    expect(screen.getByLabelText("כולל מנת שומן")).toBeChecked();
    expect(screen.getByLabelText("מנות — כולל מנת שומן")).toHaveValue("2");
    fireEvent.click(screen.getByLabelText("כולל מנת שומן"));
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onUpdateMeal).toHaveBeenCalledWith("a", expect.objectContaining({ fat_servings: 0 }));
  });

  it("prices a meal by the amount each addition was recorded at", () => {
    // Grade 4 with a small sweet: 4 + 4 × 75%.
    const day: DayPayload = {
      date: "2026-08-20",
      meals: [{ id: "a", at: "2026-08-20T09:10:00+03:00", carbs_choice: "carb_grade_4",
                vegetables: false, fruit: false,
                fat_servings: 0, additions: [{ id: "sweet", amount: "little" }], portion: null,
                second_source: null }],
      derived: { carbs: 7, meals: 1, vegetables: 0, eating_window: 0, fat: 0 },
    };
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={day}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByText("09:10").closest("li")).toHaveTextContent("דרגה 4 · 🍪 · 7");
  });

  it("opens an edited addition on the amount it was recorded at", () => {
    const day: DayPayload = {
      date: "2026-08-20",
      meals: [{ id: "a", at: "2026-08-20T09:10:00+03:00", carbs_choice: "carb_grade_4",
                vegetables: false, fruit: false,
                fat_servings: 0, additions: [{ id: "sweet", amount: "much" }], portion: null,
                second_source: null }],
      derived: { carbs: 9, meals: 1, vegetables: 0, eating_window: 0, fat: 0 },
    };
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={day}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 09:10" }));
    expect(screen.getByLabelText("כולל מתוק")).toBeChecked();
    expect(screen.getByLabelText("כמות — כולל מתוק")).toHaveValue("much");
  });

  it("offers the portion picker only on grades worth splitting by helping", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    expect(screen.queryByLabelText(/גודל המנה/)).toBeNull();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    expect(screen.queryByLabelText(/גודל המנה/)).toBeNull();
    fireEvent.click(screen.getByLabelText("דרגה 7"));
    expect(screen.getByLabelText(/גודל המנה/)).toBeInTheDocument();
  });

  it("records the picked portion, and drops it when the grade no longer offers one", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 7"));
    fireEvent.change(screen.getByLabelText(/גודל המנה/), { target: { value: "small" } });
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({
      carbs_choice: "carb_grade_7", portion: "small", second_source: null }));

    // Recording folds the inputs away, so the second half opens them again.
    openMealForm();
    // Reduced on a grade that offers the picker, then switched to one that does not: the picker
    // goes, and the helping must not travel with the meal that gets recorded instead.
    fireEvent.click(screen.getByLabelText("דרגה 7"));
    fireEvent.change(screen.getByLabelText(/גודל המנה/), { target: { value: "small" } });
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal).toHaveBeenLastCalledWith(expect.objectContaining({
      carbs_choice: "carb_grade_4", portion: null, second_source: null }));
  });

  it("defaults an offered portion to the full helping", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 7"));
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({
      carbs_choice: "carb_grade_7", portion: "full", second_source: null }));
  });

  it("opens spelled out by default, before any density has been chosen", () => {
    window.localStorage.removeItem(GRADE_LABELS_KEY);
    atLocalTime(19, 5);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    expect(screen.getByRole("button", { name: "צמצום שמות" })).toBeInTheDocument();
    expect(screen.getByLabelText("דרגה 4 (אורז לבן)")).toBeInTheDocument();
  });

  it("switches the grade reading on demand, in the picker and the rows alike", () => {
    atLocalTime(19, 5);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    expect(screen.getByLabelText("דרגה 4")).toBeInTheDocument();
    expect(screen.getAllByText("דרגה 4")).not.toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "הרחבת שמות" }));
    // One switch reaches the grade group and the recorded meal row alike.
    expect(screen.getByLabelText("דרגה 4 (אורז לבן)")).toBeInTheDocument();
    expect(screen.getAllByText("דרגה 4 (אורז לבן)")).not.toHaveLength(0);
    // A grade that lists nothing reads the same at either density.
    expect(screen.getByLabelText("דרגה 4!")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "צמצום שמות" }));
    expect(screen.getByLabelText("דרגה 4")).toBeInTheDocument();
  });

  it("spells out the picked grade for a second in the picker while names are condensed", () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2026, 7, 20, 19, 5));
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();

    fireEvent.click(screen.getByLabelText("דרגה 2"));

    expect(screen.getByLabelText("דרגה 2 (קינואה)")).toBeChecked();
    // The other options, and the recorded rows, keep the condensed reading.
    expect(screen.getByLabelText("דרגה 4")).toBeInTheDocument();
    expect(screen.getAllByText("דרגה 4")).not.toHaveLength(0);

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByLabelText("דרגה 2")).toBeChecked();
    expect(screen.queryByText("דרגה 2 (קינואה)")).toBeNull();
  });

  it("withholds the density switch while no grade name is on screen", () => {
    atLocalTime(19, 5);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    // Nothing recorded and the inputs folded: no grade name for the switch to act on.
    expect(screen.queryByRole("button", { name: "הרחבת שמות" })).toBeNull();
    openMealForm();
    expect(screen.getByRole("button", { name: "הרחבת שמות" })).toBeInTheDocument();
  });

  it("keeps the density switch over a recorded meal while the inputs are folded", () => {
    atLocalTime(19, 5);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "הרחבת שמות" })).toBeInTheDocument();
  });

  it("seats the density switch on the day's heading row and keeps it over the folded rows", () => {
    atLocalTime(19, 5);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const heading = screen.getByRole("button", { name: "יומן היום" });
    expect(screen.getByRole("button", { name: "הרחבת שמות" }).closest(".section-header"))
      .toContainElement(heading);
    // Folded, the rows stay on screen with their grade names, so the switch stays for them.
    fireEvent.click(heading);
    expect(screen.getByRole("button", { name: "הרחבת שמות" })).toBeInTheDocument();
  });

  it("keeps the meals readable under a folded journal, without their controls", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "יומן היום" }));
    expect(screen.getByText("09:10")).toBeInTheDocument();
    expect(screen.getByText("13:30")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /עריכת ארוחה/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /מחיקת ארוחה/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "הוספת ארוחה" })).toBeNull();
    // Opening the journal again renders the rows once, with their controls.
    fireEvent.click(screen.getByRole("button", { name: "יומן היום" }));
    expect(screen.getAllByText("09:10")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "עריכת ארוחה 13:30" })).toBeInTheDocument();
  });

  it("offers a second source only beside a light primary, over every grade but the plain no-carb one", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    // No primary picked yet, and a heavy one after: neither plate admits a second source.
    expect(screen.queryByRole("button", { name: "הוספת מקור פחמימה נוסף" })).toBeNull();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    expect(screen.queryByRole("button", { name: "הוספת מקור פחמימה נוסף" })).toBeNull();
    fireEvent.click(screen.getByLabelText("דרגה 2"));
    revealSecondSource();
    // Drawing on no carb source is what carrying no second source says.
    expect(secondSourceGroup().queryByLabelText("ללא פחמימות")).toBeNull();
    expect(secondSourceGroup().getByLabelText("דרגה 7")).toBeInTheDocument();
  });

  it("records a heavy second source at the picked helping", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 2"));
    revealSecondSource();
    fireEvent.click(secondSourceGroup().getByLabelText("דרגה 7"));
    fireEvent.change(screen.getByLabelText(/גודל המנה/), { target: { value: "small" } });
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    // The groups answer independently: a grade picked as the second source must not unseat the
    // meal's own, which sharing one radio name would do.
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({
      carbs_choice: "carb_grade_2", portion: null,
      second_source: { carbs_choice: "carb_grade_7", portion: "small" } }));
  });

  it("defaults a heavy second source to the full helping", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 2"));
    revealSecondSource();
    fireEvent.click(secondSourceGroup().getByLabelText("דרגה 7"));
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({
      second_source: { carbs_choice: "carb_grade_7", portion: "full" } }));
  });

  it("records a light second source with no helping and offers no picker for it", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 2"));
    revealSecondSource();
    fireEvent.click(secondSourceGroup().getByLabelText("דרגה 2"));
    // A light second grade merges into the plate, so no helping is asked for.
    expect(screen.queryByLabelText(/גודל המנה/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({
      second_source: { carbs_choice: "carb_grade_2", portion: null } }));
  });

  it("holds a recorded second source through a primary repick the contract bars", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 2"));
    revealSecondSource();
    fireEvent.click(secondSourceGroup().getByLabelText("דרגה 7"));
    fireEvent.click(primaryGroup().getByLabelText("דרגה 4"));
    // Just-picked grades read spelled out for a second, so the grade is matched by its opening.
    expect(secondSourceGroup().getByLabelText(/^דרגה 7/)).toBeChecked();
  });

  it("bars the save while the picked primary cannot carry the second source, and frees it on removal", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 2"));
    revealSecondSource();
    fireEvent.click(secondSourceGroup().getByLabelText("דרגה 7"));
    fireEvent.click(primaryGroup().getByLabelText("דרגה 4"));
    expect(screen.getByRole("button", { name: "שמירת ארוחה" })).toBeDisabled();
    // The notice names the bound off the contract, so it reads as the rule rather than a refusal.
    expect(screen.getByText(/מקור פחמימה נוסף מותר רק לצד דרגה קלה/)).toBeInTheDocument();
    // Dropping the source is the user's own act, and the heavy plate saves once they make it.
    fireEvent.click(screen.getByRole("button", { name: "הסרת מקור פחמימה נוסף" }));
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({
      carbs_choice: "carb_grade_4", second_source: null }));
  });

  it("records no second source once the group is removed", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 2"));
    revealSecondSource();
    fireEvent.click(secondSourceGroup().getByLabelText("דרגה 7"));
    fireEvent.click(screen.getByRole("button", { name: "הסרת מקור פחמימה נוסף" }));
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({
      carbs_choice: "carb_grade_2", second_source: null }));
  });

  it("records no second source from a group left open and unanswered", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 2"));
    revealSecondSource();
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({ second_source: null }));
  });

  it("opens a recorded second carb source into its own group for correction", () => {
    atLocalTime(19, 5);
    const twoSourceDay: DayPayload = {
      ...trackedDay,
      meals: [{ ...trackedDay.meals[1], carbs_choice: "carb_grade_2",
                second_source: { carbs_choice: "carb_grade_7", portion: "small" } }],
    };
    const onUpdateMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={twoSourceDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={onUpdateMeal}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    expect(secondSourceGroup().getByLabelText("דרגה 7")).toBeChecked();
    expect(screen.getByLabelText(/גודל המנה/)).toHaveValue("small");
    // An unrelated divergence surfaces the save button while leaving the second source untouched.
    fireEvent.click(screen.getByLabelText("כולל ירקות"));
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onUpdateMeal).toHaveBeenCalledWith("b", expect.objectContaining({
      second_source: { carbs_choice: "carb_grade_7", portion: "small" } }));
  });

  it("records the picked choice id even when another choice shares its numeric value", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4!"));
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({ carbs_choice: "grade4b" }));
  });

  it("defaults the meal time to the five-minute boundary just passed", () => {
    atLocalTime(12, 27);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("12:25");
  });

  it("records a meal at the picked time rather than the submission moment", () => {
    atLocalTime(16, 5);
    const onAddMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "13:00" } });
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal.mock.calls[0][0].at).toMatch(/^2026-08-20T13:00:00[+-]\d{2}:\d{2}$/);
  });

  it("returns the meal time to the default estimate after a meal is recorded", () => {
    atLocalTime(16, 5);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "13:00" } });
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    // Recording folds the inputs away, so the restored default is read back through the header.
    fireEvent.click(screen.getByRole("button", { name: "הוספת ארוחה" }));
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("16:05");
  });

  it("refuses to record a meal at a time the day has not reached yet", () => {
    atLocalTime(13, 0);
    const onAddMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "14:00" } });
    expect(screen.getByRole("button", { name: "שמירת ארוחה" })).toBeDisabled();
    expect(screen.getByText("לא ניתן לרשום ארוחה בשעה עתידית")).toBeInTheDocument();
  });

  it("loads a recorded meal into the meal form when its edit button is tapped", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()}
                       onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("13:30");
    expect(screen.getByLabelText("דרגה 4")).toBeChecked();
    expect(screen.getByLabelText("כולל פרי")).toBeChecked();
    expect(screen.getByLabelText("כולל ירקות")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "עדכון ארוחה" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "הוספת ארוחה" })).toBeNull();
  });

  it("sends the edited meal under its own id and returns the form to recording", () => {
    atLocalTime(19, 5);
    const onUpdateMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={onUpdateMeal} onDeleteMeal={vi.fn()}
                       onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByLabelText("כולל ירקות"));
    fireEvent.click(screen.getByLabelText("כולל מתוק"));
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onUpdateMeal).toHaveBeenCalledWith("b", expect.objectContaining({
      carbs_choice: "carb_grade_4", vegetables: true, fruit: true,
      fat_servings: 0, additions: [{ id: "sweet", amount: "regular" }], portion: null, second_source: null }));
    expect(onUpdateMeal.mock.calls[0][1].at).toMatch(/T12:00:00[+-]\d{2}:\d{2}$/);
    expect(screen.queryByRole("button", { name: "עדכון ארוחה" })).toBeNull();
  });

  it("cancels an untouched edit without a dialog and restores the default meal time", () => {
    atLocalTime(19, 5);
    const onUpdateMeal = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={onUpdateMeal} onDeleteMeal={vi.fn()}
                       onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    expect(screen.getByRole("button", { name: "יציאה מעריכה" })).not.toHaveClass("destructive");
    fireEvent.click(screen.getByRole("button", { name: "יציאה מעריכה" }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onUpdateMeal).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "עדכון ארוחה" })).toBeNull();
    // The edit is gone, not merely hidden: the inputs come back on the recording defaults.
    fireEvent.click(screen.getByRole("button", { name: "הוספת ארוחה" }));
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("19:05");
    expect(screen.getByLabelText("דרגה 4")).not.toBeChecked();
  });

  it("keeps a diverged edit when its discard dialog is dismissed", () => {
    atLocalTime(19, 5);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()}
                       onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.click(screen.getByLabelText("כולל ירקות"));
    expect(screen.getByRole("button", { name: "ביטול שינויים" })).toHaveClass("destructive");
    fireEvent.click(screen.getByRole("button", { name: "ביטול שינויים" }));
    expect(screen.getByRole("button", { name: "עדכון ארוחה" })).toBeInTheDocument();
    expect(screen.getByLabelText("כולל ירקות")).toBeChecked();
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("13:30");
  });

  it("discards a diverged edit once its dialog is confirmed", () => {
    atLocalTime(19, 5);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()}
                       onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "ביטול שינויים" }));
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "עדכון ארוחה" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "הוספת ארוחה" }));
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("19:05");
  });

  it("treats a re-picked addition as a divergence worth confirming", () => {
    atLocalTime(19, 5);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()}
                       onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.click(screen.getByLabelText("כולל מתוק"));
    fireEvent.click(screen.getByRole("button", { name: "ביטול שינויים" }));
    expect(confirmSpy).toHaveBeenCalledOnce();
  });

  it("falls back to recording when the meal being edited is deleted", () => {
    const { rerender } = render(
      <DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                  firstMealHour={NO_NUDGE_HOUR}
                  mealGapHours={NO_NUDGE_GAP_HOURS}
                  onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()}
                  onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));

    rerender(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire}
                         firstMealHour={NO_NUDGE_HOUR}
                         mealGapHours={NO_NUDGE_GAP_HOURS}
                         day={{ ...trackedDay, meals: [trackedDay.meals[0]] }}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()}
                         onCloseDay={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "עדכון ארוחה" })).toBeNull();
    expect(screen.getByRole("button", { name: "הוספת ארוחה" })).toBeInTheDocument();
  });

  it("collapses to the dashboard and the meal rows, and expands back on header toggle", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={wideWindowDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: "יומן היום" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(dashboardFigure("ציון")).toHaveTextContent("ציון: 4");
    expect(screen.queryByRole("button", { name: "שמירת ארוחה" })).toBeNull();
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();
    // The recorded rows stay, read-only; the picker's grade radios are gone with the inputs.
    expect(screen.getByText(/דרגה 4/)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();

    fireEvent.click(toggle);
    openMealForm();
    expect(screen.getByLabelText("דרגה 4")).toBeInTheDocument();
  });

  it("starts with the meal inputs folded behind the actions and the meal list", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={wideWindowDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("שעת הארוחה")).toBeNull();
    expect(screen.queryByLabelText("דרגה 4")).toBeNull();
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
    expect(screen.getByText("13:30")).toBeInTheDocument();
    expect(dashboardFigure("ציון")).toHaveTextContent("ציון: 4");
  });

  it("keeps the toggle quiet while the last meal is younger than the gap", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={4}
                       day={dayWithMealHoursAgo(3)}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(mealFormSection().className).not.toMatch(/nudge/);
  });

  it("keeps the inputs folded but blinks the toggle once the gap since the last meal passed", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={4}
                       day={dayWithMealHoursAgo(5)}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(mealFormSection()).toHaveClass("nudge-0");
  });

  it("greys the add-meal toggle while the last meal is under three and a half hours old", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={4}
                       day={dayWithMealHoursAgo(3)}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(mealFormSection()).toHaveClass("meal-add-early");
  });

  it("gives the toggle its colour back once three and a half hours have passed", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={4}
                       day={dayWithMealHoursAgo(3.5)}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(mealFormSection()).not.toHaveClass("meal-add-early");
  });

  it("stops the nudge once a fresh meal lands in the day's list", () => {
    const props = { questionnaire, firstMealHour: NO_NUDGE_HOUR, mealGapHours: 4,
                    onAddMeal: vi.fn(), onUpdateMeal: vi.fn(), onDeleteMeal: vi.fn(),
                    onCloseDay: vi.fn() };
    const { rerender } = render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} {...props} day={dayWithMealHoursAgo(5)} />);
    expect(mealFormSection()).toHaveClass("nudge-0");

    rerender(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} {...props} day={dayWithMealHoursAgo(1)} />);

    expect(mealFormSection().className).not.toMatch(/nudge/);
  });

  it("blinks the toggle from the first-meal hour on a day with nothing recorded", () => {
    atLocalTime(11);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={11}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(mealFormSection()).toHaveClass("nudge-0");
  });

  it("keeps the toggle quiet before the first-meal hour", () => {
    atLocalTime(10, 59);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={11}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(mealFormSection().className).not.toMatch(/nudge/);
  });

  it("keeps the toggle quiet past the hour once the day has a recorded meal", () => {
    atLocalTime(15);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={11}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(mealFormSection().className).not.toMatch(/nudge/);
  });

  it("pauses the nudge while the inputs are open and resumes it when they fold again", () => {
    atLocalTime(11);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={11}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    expect(mealFormSection()).toHaveClass("meal-form meal-form-open", { exact: true });

    fireEvent.click(screen.getByRole("button", { name: "הוספת ארוחה" }));

    expect(mealFormSection()).toHaveClass("nudge-0");
  });

  it("escalates the blink after ten seconds and settles into the slow beat after twenty", () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2026, 7, 20, 11, 0));
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={11}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(mealFormSection()).toHaveClass("nudge-0");

    act(() => vi.advanceTimersByTime(10_000));
    expect(mealFormSection()).toHaveClass("nudge-1");

    act(() => vi.advanceTimersByTime(10_000));
    expect(mealFormSection()).toHaveClass("nudge-2");

    // The slow beat is the standing state: nothing further is scheduled past it.
    act(() => vi.advanceTimersByTime(600_000));
    expect(mealFormSection()).toHaveClass("nudge-2");
  });

  it("unfolds the meal inputs when a recorded meal is opened for editing", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       day={dayWithMealHoursAgo(1)}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: /^עריכת ארוחה/ }));

    expect(screen.getByRole("button", { name: "עדכון ארוחה" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("folds the meal inputs away once a meal is recorded", () => {
    atLocalTime(19, 5);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));

    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("שעת הארוחה")).toBeNull();
  });

  it("folds the meal inputs away once a correction is sent", () => {
    atLocalTime(19, 5);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.click(screen.getByLabelText("כולל ירקות"));
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));

    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("offers saving an edit only once it diverges from the stored meal", () => {
    atLocalTime(19, 5);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    expect(screen.queryByRole("button", { name: "שמירת ארוחה" })).toBeNull();
    fireEvent.click(screen.getByLabelText("כולל ירקות"));
    expect(screen.getByRole("button", { name: "שמירת ארוחה" })).toBeInTheDocument();
    // Undoing the change puts the form back on the stored meal, and the button withdraws with it.
    fireEvent.click(screen.getByLabelText("כולל ירקות"));
    expect(screen.queryByRole("button", { name: "שמירת ארוחה" })).toBeNull();
  });

  it("closes an untouched recording form from its cancel button without asking", () => {
    atLocalTime(19, 5);
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    // The corner icon carries the same name, so the text button is told apart by its styling.
    const cancel = screen.getAllByRole("button", { name: "סגירת הטופס" })
      .find((b) => !b.classList.contains("glyph"))!;
    fireEvent.click(cancel);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("discards a half-composed meal from the destructive cancel button", () => {
    atLocalTime(19, 5);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    const cancel = screen.getByRole("button", { name: "ביטול שינויים" });
    expect(cancel).toHaveClass("destructive");
    fireEvent.click(cancel);

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("folds the meal inputs away when an edit is cancelled", () => {
    atLocalTime(19, 5);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.click(screen.getByRole("button", { name: "יציאה מעריכה" }));

    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("שעת הארוחה")).toBeNull();
  });

  it("leaves an untouched edit when the meal inputs are folded away", () => {
    atLocalTime(19, 5);
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.click(screen.getByRole("button", { name: "עדכון ארוחה" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    const toggle = screen.getByRole("button", { name: "הוספת ארוחה" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // The edit is gone, not merely hidden: the inputs come back on the recording defaults.
    fireEvent.click(toggle);
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("19:05");
    expect(screen.getByLabelText("דרגה 4")).not.toBeChecked();
  });

  it("folds an untouched recording form away without asking", () => {
    atLocalTime(11);
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={11}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByRole("button", { name: "הוספת ארוחה" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("keeps a half-composed meal and its open inputs when the fold's dialog is dismissed", () => {
    atLocalTime(19, 5);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.click(screen.getByRole("button", { name: "הוספת ארוחה" }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "true");
    // Still spelled out from the pick a moment ago, or trimmed back: checked either way.
    expect(screen.getByLabelText(/^דרגה 4( \(אורז לבן\))?$/)).toBeChecked();
  });

  it("resets a half-composed meal once the fold's dialog is confirmed", () => {
    atLocalTime(19, 5);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.click(screen.getByLabelText("כולל ירקות"));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "12:00" } });
    const toggle = screen.getByRole("button", { name: "הוספת ארוחה" });
    fireEvent.click(toggle);

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByLabelText("דרגה 4")).not.toBeChecked();
    expect(screen.getByLabelText("כולל ירקות")).not.toBeChecked();
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("19:05");
  });

  it("folds the form from the corner close button, through the same discard guard", () => {
    atLocalTime(19, 5);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.click(screen.getByRole("button", { name: "סגירת הטופס" }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "סגירת הטופס" })).not.toBeInTheDocument();
  });

  it("asks before folding away a meal time picked off the opening default", () => {
    atLocalTime(19, 5);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "17:00" } });
    fireEvent.click(screen.getByRole("button", { name: "הוספת ארוחה" }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("17:00");
  });

  it("unfolds the recording form without asking, whatever the clock has done meanwhile", () => {
    atLocalTime(19, 5);
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByRole("button", { name: "הוספת ארוחה" }));
    // The default time the folded form was reset to is now half an hour stale; reopening the
    // inputs must not read that drift as something the user typed.
    vi.setSystemTime(new Date(2026, 7, 20, 19, 35));
    openMealForm();
    fireEvent.click(screen.getByRole("button", { name: "הוספת ארוחה" }));

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("keeps a diverged edit and its open inputs when the fold's dialog is dismissed", () => {
    atLocalTime(19, 5);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.click(screen.getByLabelText("כולל ירקות"));
    fireEvent.click(screen.getByRole("button", { name: "עדכון ארוחה" }));

    expect(screen.getByRole("button", { name: "עדכון ארוחה" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("כולל ירקות")).toBeChecked();
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("13:30");
  });

  it("discards a diverged edit once the fold's dialog is confirmed", () => {
    atLocalTime(19, 5);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "עדכון ארוחה" }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    const toggle = screen.getByRole("button", { name: "הוספת ארוחה" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("19:05");
  });

  it("renders the score bold and last in the dashboard", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const score = dashboardFigure("ציון");
    expect(score.tagName).toBe("STRONG");
    expect(score.parentElement!.lastElementChild).toBe(score);
  });

  it("exposes the carbs tooltip on the dashboard score", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(dashboardFigure("ציון")).toHaveAttribute("title", "המטרה היא ציון נמוך");
  });

  it("shows the day's derived values and meal list with delete", () => {
    const onDeleteMeal = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={onDeleteMeal} onCloseDay={vi.fn()} />);
    expect(dashboardFigure("ציון")).toHaveTextContent("ציון: 4");
    expect(dashboardFigure("חלון")).toHaveTextContent("חלון: 5 שעות");
    // The folded inputs leave the carbs picker unrendered, so the only grade text on screen is
    // the recorded meal's own.
    expect(screen.getAllByText("דרגה 4")).toHaveLength(1);
    expect(screen.getByText(/🥗/)).toBeInTheDocument();
    expect(screen.getByText(/🍎/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "מחיקת ארוחה 13:30" }));
    expect(onDeleteMeal).toHaveBeenCalledWith("b");
  });

  it("disables a meal's delete button only while its deletion is in flight", () => {
    const props = { maxMealsPerDay: NO_CAP_MEALS, closeMinWindowHours: 6, closeFrom: CLOSE_FROM, stretchesUntil: STRETCHES_UNTIL, questionnaire, day: trackedDay,
                    firstMealHour: NO_NUDGE_HOUR, mealGapHours: NO_NUDGE_GAP_HOURS,
                    onAddMeal: vi.fn(), onUpdateMeal: vi.fn(), onDeleteMeal: vi.fn(),
                    onCloseDay: vi.fn() };
    const { rerender } = render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} {...props} deletingMealId="b" />);
    expect(screen.getByRole("button", { name: "מחיקת ארוחה 13:30" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "מחיקת ארוחה 09:10" })).toBeEnabled();

    // A failed deletion clears the in-flight id without removing the row; its button must come
    // back rather than stay locked on a meal that still exists.
    rerender(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} {...props} deletingMealId={undefined} />);
    expect(screen.getByRole("button", { name: "מחיקת ארוחה 13:30" })).toBeEnabled();
  });

  it("lists meals in time order, oldest first", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const times = screen.getAllByText(/^\d{2}:\d{2}$/).map((el) => el.textContent);
    expect(times).toEqual(["09:10", "13:30"]);
  });

  it("shows each meal's effective points at the end of its row", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByText("09:10").closest("li")).toHaveTextContent("ללא פחמימות · 🥗 · 0");
    expect(screen.getByText("13:30").closest("li")).toHaveTextContent("דרגה 4 · 🍎 · 4");
  });

  it("gives each meal's time its own cell, so a wrapped description never runs under it", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const time = screen.getByText("09:10");
    expect(time).toHaveClass("meal-at");
    // The description is a sibling of the time rather than its container, so the row lays the two
    // out as columns and every line of a wrapped description shares one edge.
    expect(time.closest("li")!.querySelector(".meal-text")).not.toHaveTextContent("09:10");
  });

  it("gives each meal's points their own cell so the scores hold a column", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    for (const [time, score] of [["09:10", "0"], ["13:30", "4"]] as const) {
      const row = screen.getByText(time).closest("li")!;
      const cell = Array.from(row.children).find((el) => el.classList.contains("meal-points"));
      expect(cell, `no points cell in the ${time} row`).toBeDefined();
      expect(cell).toHaveTextContent(score);
    }
  });

  it("names the meal's score through the carbs tooltip, so the bare number is explained", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const row = screen.getByText("13:30").closest("li")!;
    const cell = Array.from(row.children).find((el) => el.classList.contains("meal-points"));
    expect(cell).toHaveAttribute("title", "המטרה היא ציון נמוך");
  });

  it("shows a marker per addition on a recorded meal, and the fat servings with their count", () => {
    const additionsDay: DayPayload = {
      date: "2026-08-20",
      meals: [{ id: "a", at: "2026-08-20T09:10:00+03:00", carbs_choice: "carb_grade_4",
                vegetables: false, fruit: false, fat_servings: 2,
                additions: [{ id: "sweet", amount: "regular" }, { id: "alcohol", amount: "regular" }],
                portion: null, second_source: null }],
      derived: { carbs: 12, meals: 1, vegetables: 0, eating_window: 0, fat: 2 },
    };
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={additionsDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByText("09:10").closest("li"))
      .toHaveTextContent("דרגה 4 · 🥑×2 · 🍪 · 🍷 · 12");
  });

  it("marks each meal's row controls with the glyph role", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    for (const button of screen.getAllByRole("button", { name: /מחיקת ארוחה|עריכת ארוחה/ })) {
      expect(button).toHaveClass("glyph");
    }
  });

  it("close-day asks for water and submits derived values plus drinking", () => {
    const onCloseDay = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={wideWindowDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={onCloseDay} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    fireEvent.click(screen.getByRole("button", { name: "אישור וסגירה" }));
    expect(onCloseDay).toHaveBeenCalledWith({
      carbs: 4, meals: 2, vegetables: 1, eating_window: 7, fat: 0, drinking: 3 });
  });

  it("the close-day button leaves once its panel opens, so the flow ends in the confirm", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={wideWindowDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    expect(screen.getByRole("button", { name: "אישור וסגירה" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();
    // With the opening button gone, the panel itself says where the flow stands.
    expect(screen.getByRole("heading", { name: "השלב האחרון בסגירת היום" })).toBeInTheDocument();
  });

  it("walks the opened close panel into view and hands focus to the water choices", () => {
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={wideWindowDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(scrollIntoView).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("3 ליטר")).toHaveFocus();
    scrollIntoView.mockRestore();
  });

  it("the close flow does not linger past the close into a reopened day", () => {
    const props = { maxMealsPerDay: NO_CAP_MEALS, closeMinWindowHours: 6, closeFrom: CLOSE_FROM, stretchesUntil: STRETCHES_UNTIL, questionnaire, day: wideWindowDay,
                    firstMealHour: NO_NUDGE_HOUR, mealGapHours: NO_NUDGE_GAP_HOURS,
                    onAddMeal: vi.fn(), onUpdateMeal: vi.fn(), onDeleteMeal: vi.fn(),
                    onCloseDay: vi.fn(), onReopenDay: vi.fn() };
    const { rerender } = render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    fireEvent.click(screen.getByRole("button", { name: "אישור וסגירה" }));

    // The close lands, then the record is deleted — the same instance stays mounted throughout,
    // and the reopened day must greet the user at the start, not inside a stale water panel.
    rerender(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} {...props} closed />);
    rerender(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} {...props} closed={false} />);
    expect(screen.queryByRole("button", { name: "אישור וסגירה" })).toBeNull();
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
  });

  it("offers closing at whatever minimum window the config sets", () => {
    // trackedDay spans 4.5 hours: under the repo's six-hour bound, over a configured four.
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={4} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL}
                       questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
  });

  it("close-day stays hidden before the evening until the recorded meals span six hours", () => {
    atLocalTime(15);
    const { rerender } = render(
      <DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                  firstMealHour={NO_NUDGE_HOUR}
                  mealGapHours={NO_NUDGE_GAP_HOURS}
                  onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                  onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(dashboardFigure("חלון")).toHaveTextContent("חלון: 5 שעות");
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();

    rerender(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={wideWindowDay}
                         firstMealHour={NO_NUDGE_HOUR}
                         mealGapHours={NO_NUDGE_GAP_HOURS}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                         onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(dashboardFigure("חלון")).toHaveTextContent("חלון: 7 שעות");
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
  });

  it("folds the close-day panel away when a deletion narrows the window below six hours", () => {
    atLocalTime(15);
    const { rerender } = render(
      <DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={wideWindowDay}
                  firstMealHour={NO_NUDGE_HOUR}
                  mealGapHours={NO_NUDGE_GAP_HOURS}
                  onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                  onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    expect(screen.getByRole("button", { name: "אישור וסגירה" })).toBeInTheDocument();

    rerender(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={trackedDay}
                         firstMealHour={NO_NUDGE_HOUR}
                         mealGapHours={NO_NUDGE_GAP_HOURS}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                         onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "אישור וסגירה" })).toBeNull();
  });

  it("close-day saves the composed meal itself and continues into closing", () => {
    const onAddMeal = vi.fn();
    const onCloseDay = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={wideWindowDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={onCloseDay} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    expect(onAddMeal).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    fireEvent.click(screen.getByRole("button", { name: "אישור וסגירה" }));
    expect(onCloseDay).toHaveBeenCalledWith({
      carbs: 4, meals: 2, vegetables: 1, eating_window: 7, fat: 0, drinking: 3 });
  });

  it("close-day locks only while the composed meal cannot be saved yet", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={wideWindowDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("כולל ירקות"));
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeDisabled();
    expect(screen.getByText("יש לשמור או לבטל את הארוחה שבטופס לפני סגירת היום"))
      .toBeInTheDocument();
  });

  it("close-day's confirm waits for the meal it saved to land in the day's figures", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={wideWindowDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS} savingMeal
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    expect(screen.getByRole("button", { name: "אישור וסגירה" })).toBeDisabled();
  });

  it("a meal composed after the close-day panel opened locks its confirm the same way", () => {
    const onCloseDay = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={wideWindowDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={onCloseDay} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    expect(screen.getByRole("button", { name: "אישור וסגירה" })).toBeDisabled();
    expect(screen.getByText("יש לשמור או לבטל את הארוחה שבטופס לפני סגירת היום"))
      .toBeInTheDocument();
  });

  it("close-day appears before the evening only once two meals span the window", () => {
    atLocalTime(15);
    const singleMealDay: DayPayload = {
      date: "2026-08-20",
      meals: [trackedDay.meals[0]],
      derived: { carbs: 0, meals: 1, vegetables: 1, eating_window: 0, fat: 0 },
    };
    const { rerender } = render(
      <DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={emptyDay}
                  firstMealHour={NO_NUDGE_HOUR}
                  mealGapHours={NO_NUDGE_GAP_HOURS}
                  onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                  onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();

    rerender(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={singleMealDay}
                         firstMealHour={NO_NUDGE_HOUR}
                         mealGapHours={NO_NUDGE_GAP_HOURS}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                         onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();

    rerender(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={wideWindowDay}
                         firstMealHour={NO_NUDGE_HOUR}
                         mealGapHours={NO_NUDGE_GAP_HOURS}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                         onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
  });

  // trackedDay holds two meals, so a cap of two is the day at its quota and three is under it.
  const renderWithCap = (maxMealsPerDay: number) =>
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={maxMealsPerDay} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire}
                       day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);

  it("offers the add-meal toggle while the day is under the cap", () => {
    renderWithCap(3);
    expect(screen.getByRole("button", { name: "הוספת ארוחה" })).toBeInTheDocument();
    expect(screen.queryByText(/הושלמו/)).toBeNull();
  });

  it("replaces the add-meal toggle with a completion note at the cap", () => {
    renderWithCap(2);
    expect(screen.queryByRole("button", { name: "הוספת ארוחה" })).toBeNull();
    expect(screen.getByText("הושלמו 2 ארוחות היום")).toBeInTheDocument();
  });

  it("still opens the form for correcting a recorded meal at the cap", () => {
    renderWithCap(2);
    fireEvent.click(screen.getAllByRole("button", { name: /עריכת ארוחה/ })[0]);
    expect(screen.getByRole("button", { name: "עדכון ארוחה" })).toBeInTheDocument();
  });

  // The small-hours grace window: the clock has crossed into the next date, the payload is the
  // previous day's, and isToday is what tells the tracker so. firstMealHour 0 would nudge an
  // under-tracked running day from midnight on, proving quiet means targeting, not timing.
  const renderYesterday = (payload: DayPayload, onAddMeal = vi.fn()) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 21, 0, 30));
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire} day={payload}
                       isToday={false}
                       firstMealHour={0} mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
  };

  it("titles itself for yesterday when targeting the previous day", () => {
    renderYesterday(trackedDay);
    expect(screen.getByRole("button", { name: "יומן אתמול" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("button", { name: "יומן היום" })).toBeNull();
  });

  it("keeps the add-meal nudge quiet on the previous day", () => {
    renderYesterday(emptyDay);
    expect(mealFormSection().className).not.toMatch(/nudge/);
  });

  it("dates a recorded meal to the targeted day rather than the clock's date", () => {
    const onAddMeal = vi.fn();
    renderYesterday(emptyDay, onAddMeal);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "22:00" } });
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal.mock.calls[0][0].at).toMatch(/^2026-08-20T22:00/);
  });

  it("accepts an evening time the clock has not reached, since the day is already over", () => {
    const onAddMeal = vi.fn();
    renderYesterday(emptyDay, onAddMeal);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "23:00" } });
    expect(screen.queryByText("לא ניתן לרשום ארוחה בשעה עתידית")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal).toHaveBeenCalled();
  });

  it("opens the meal form on the targeted day's last five-minute mark", () => {
    renderYesterday(emptyDay);
    openMealForm();
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("23:55");
  });

  // A closed day keeps the tracker on screen but reduced to one gated control: the add-meal
  // toggle asks to reopen the eating window, and confirming hands the day-record deletion to
  // the same path the history table uses.
  const renderClosed = (onReopenDay = vi.fn()) => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire}
                       day={trackedDay} closed onReopenDay={onReopenDay}
                       firstMealHour={NO_NUDGE_HOUR} mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    return onReopenDay;
  };

  it("reduces a closed day to its meals, read-only, and the add-meal toggle", () => {
    renderClosed();
    expect(screen.getByRole("button", { name: "הוספת ארוחה" })).toBeInTheDocument();
    // The button undoes the close, so its effect is spelled out beside it before any click.
    expect(screen.getByText("(פתיחת חלון האכילה)")).toBeInTheDocument();
    // The recorded meals stay readable, as in the history table's day view, but carry no
    // controls: correcting them means reopening the day first.
    expect(screen.getByText("09:10")).toBeInTheDocument();
    expect(screen.getByText("13:30")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();
    // The last meal alone keeps its pencil: correcting it reopens the day behind the same
    // question as adding one. Nothing on a closed day deletes a meal.
    expect(screen.getByRole("button", { name: "עריכת ארוחה 13:30" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "עריכת ארוחה 09:10" })).toBeNull();
    expect(screen.queryByRole("button", { name: /מחיקת ארוחה/ })).toBeNull();
    // The density switch stays: the read-only rows still name grades worth spelling out.
    expect(screen.getByRole("button", { name: "הרחבת שמות" })).toBeInTheDocument();
  });

  it("reopens the closed day once the eating-window question is confirmed, form ready", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onReopenDay = vi.fn();
    const props = { maxMealsPerDay: NO_CAP_MEALS, closeMinWindowHours: 6, closeFrom: CLOSE_FROM, stretchesUntil: STRETCHES_UNTIL, questionnaire, day: trackedDay, onReopenDay,
                    firstMealHour: NO_NUDGE_HOUR, mealGapHours: NO_NUDGE_GAP_HOURS,
                    onAddMeal: vi.fn(), onUpdateMeal: vi.fn(), onDeleteMeal: vi.fn(),
                    onCloseDay: vi.fn() };
    const { rerender } = render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} {...props} closed />);
    fireEvent.click(screen.getByRole("button", { name: "הוספת ארוחה" }));
    expect(window.confirm).toHaveBeenCalledWith("האם לפתוח את חלון האכילה מחדש?");
    expect(onReopenDay).toHaveBeenCalledTimes(1);

    // The deletion round-trips and the day comes back open; the inputs the click asked for are
    // already waiting rather than folded behind a second toggle.
    rerender(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} {...props} closed={false} />);
    expect(screen.getByLabelText("שעת הארוחה")).toBeInTheDocument();
  });

  it("leaves a closed day alone when the reopen question is dismissed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onReopenDay = renderClosed();
    fireEvent.click(screen.getByRole("button", { name: "הוספת ארוחה" }));
    expect(onReopenDay).not.toHaveBeenCalled();
  });

  it("reopens the closed day from its last meal's pencil, that meal loaded for correction", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onReopenDay = vi.fn();
    const props = { maxMealsPerDay: NO_CAP_MEALS, closeMinWindowHours: 6, closeFrom: CLOSE_FROM, stretchesUntil: STRETCHES_UNTIL, questionnaire, day: trackedDay, onReopenDay,
                    firstMealHour: NO_NUDGE_HOUR, mealGapHours: NO_NUDGE_GAP_HOURS,
                    onAddMeal: vi.fn(), onUpdateMeal: vi.fn(), onDeleteMeal: vi.fn(),
                    onCloseDay: vi.fn() };
    const { rerender } = render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} {...props} closed />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    expect(window.confirm).toHaveBeenCalledWith("האם לפתוח את חלון האכילה מחדש?");
    expect(onReopenDay).toHaveBeenCalledTimes(1);

    // The day comes back open with the form already correcting the meal the pencil named.
    rerender(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} {...props} closed={false} />);
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("13:30");
    expect(screen.getByLabelText("דרגה 4")).toBeChecked();
    expect(screen.getByRole("button", { name: "עדכון ארוחה" })).toBeInTheDocument();
  });

  it("leaves a closed day alone when the last meal's pencil is dismissed at the reopen question", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onReopenDay = renderClosed();
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    expect(onReopenDay).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "עדכון ארוחה" })).toBeNull();
  });

  // From the third recorded meal, one more would cross the meals rule's bound. The warning rides
  // the add-meal controls themselves — the form toggle's label and the closed day's reopen
  // control — before that meal exists to redden a history row.
  const renderWithMeals = (day: DayPayload, closed = false) =>
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL} questionnaire={questionnaire}
                       day={day} closed={closed} onReopenDay={vi.fn()}
                       firstMealHour={NO_NUDGE_HOUR} mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);

  it("warns on the add-meal toggle once another meal would cross the meals bound", () => {
    renderWithMeals(threeMealDay);
    const toggle = screen.getByRole("button", { name: "הוספת ארוחה" });
    expect(within(toggle).getByText("הוספת ארוחה")).toHaveClass("meal-add-warn");
  });

  it("keeps the add-meal toggle plain while another meal stays within the meals bound", () => {
    renderWithMeals(trackedDay);
    const toggle = screen.getByRole("button", { name: "הוספת ארוחה" });
    expect(toggle.querySelector(".meal-add-warn")).toBeNull();
  });

  it("carries the warning onto the closed day's reopen control", () => {
    renderWithMeals(threeMealDay, true);
    expect(screen.getByRole("button", { name: "הוספת ארוחה" })).toHaveClass("meal-add-warn");
  });

  it("keeps the reopen control plain while another meal stays within the meals bound", () => {
    renderWithMeals(trackedDay, true);
    expect(screen.getByRole("button", { name: "הוספת ארוחה" })).not.toHaveClass("meal-add-warn");
  });

  it("warns on the treat day as on any other day", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={{ weekday: "THU" }} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL}
                       questionnaire={questionnaire} day={threeMealDay} onReopenDay={vi.fn()}
                       firstMealHour={NO_NUDGE_HOUR} mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: "הוספת ארוחה" });
    expect(within(toggle).getByText("הוספת ארוחה")).toHaveClass("meal-add-warn");
  });

  // The day's record leads the panel, the form for the next meal below it.
  it("lists the recorded meals above the add-meal toggle", () => {
    renderWithMeals(trackedDay);
    const list = screen.getByText("13:30").closest("ul")!;
    const toggle = screen.getByRole("button", { name: "הוספת ארוחה" });
    expect(list.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // A small helping of grade 7 derives 4.2 points; the mark the dashboard shows reads whole.
  it("rounds the dashboard's mark to a whole number", () => {
    renderWithMeals({
      ...emptyDay,
      meals: [{ id: "h", at: "2026-08-20T09:00:00+03:00", carbs_choice: "carb_grade_7",
                vegetables: false, fruit: false, fat_servings: 0, additions: [], portion: "small",
                second_source: null }],
    });
    expect(dashboardFigure("ציון")).toHaveTextContent("ציון: 4");
  });
});

describe("DayTracker score breakdown", () => {
  // trackedDay with its second meal steepened: grade 7 beside the day's fruit is 7, over the
  // fixture's day rule of 8 once the heaped sweet is priced in.
  const heavyDay: DayPayload = {
    ...trackedDay,
    meals: [trackedDay.meals[0],
            { ...trackedDay.meals[1], carbs_choice: "carb_grade_7", fat_servings: 0, additions: [{ id: "sweet", amount: "much" }] }],
  };
  const renderHeavy = () =>
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL}
                       questionnaire={questionnaire} day={heavyDay}
                       firstMealHour={NO_NUDGE_HOUR} mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);

  it("swaps the meal list and form for the score's breakdown from the heavy score, and back from it", () => {
    renderHeavy();
    expect(screen.getByRole("button", { name: "עריכת ארוחה 13:30" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "פירוט הציון" }));
    expect(screen.getByRole("heading", { name: "פירוט הציון" })).toBeInTheDocument();
    expect(screen.getByText("כולל מתוק · הרבה")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "עריכת ארוחה 13:30" })).toBeNull();
    expect(screen.queryByRole("button", { name: /הוספת ארוחה|שמירת ארוחה/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "פירוט הציון" }));
    expect(screen.queryByRole("heading", { name: "פירוט הציון" })).toBeNull();
    expect(screen.getByRole("button", { name: "עריכת ארוחה 13:30" })).toBeInTheDocument();
  });

  it("puts the meal list back on its own half a minute after the breakdown opened", () => {
    vi.useFakeTimers();
    renderHeavy();
    fireEvent.click(screen.getByRole("button", { name: "פירוט הציון" }));
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(screen.queryByRole("heading", { name: "פירוט הציון" })).toBeNull();
    expect(screen.getByRole("button", { name: "עריכת ארוחה 13:30" })).toBeInTheDocument();
  });

  it("offers no breakdown on a day within the rule", () => {
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL}
                       questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR} mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "פירוט הציון" })).toBeNull();
  });
});

describe("a day's log stretching past midnight", () => {
  afterEach(() => { window.localStorage.clear(); vi.useRealTimers(); });
  beforeEach(() => window.localStorage.setItem(GRADE_LABELS_KEY, "false"));

  // 00:30 on 21.8, with 20.8's log still the one the tracker stands on.
  const inTheSmallHours = () => {
    atLocalTime(0, 30, 21);
    const onAddMeal = vi.fn();
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL}
                       questionnaire={questionnaire} day={trackedDay} isToday={false}
                       firstMealHour={NO_NUDGE_HOUR} mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    return onAddMeal;
  };

  it("records a small-hours meal on the night's own date, in the day it ran out of", () => {
    const onAddMeal = inTheSmallHours();
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "00:30" } });
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal.mock.calls[0][0].at).toMatch(/^2026-08-21T00:30:00[+-]\d{2}:\d{2}$/);
  });

  it("keeps an evening time on the log's own date", () => {
    const onAddMeal = inTheSmallHours();
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "21:40" } });
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal.mock.calls[0][0].at).toMatch(/^2026-08-20T21:40:00[+-]\d{2}:\d{2}$/);
  });

  it("refuses a small-hours time the clock has not reached yet", () => {
    inTheSmallHours();
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "01:00" } });
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    expect(screen.getByText("לא ניתן לרשום ארוחה בשעה עתידית")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "שמירת ארוחה" })).toBeDisabled();
  });

  it("sends a small-hours time picked on a running day's own log to yesterday's log", () => {
    atLocalTime(9);
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL}
                       questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR} mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "00:30" } });
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    expect(screen.getByText("שעה זו שייכת ליום הקודם — ניתן לרשום אותה ביומן אתמול"))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "שמירת ארוחה" })).toBeDisabled();
  });
});

describe("next-meal recommendation", () => {
  const BUTTON = { name: "מה לאכול בארוחה הבאה?" };

  // Mirrors the other cases' render, with the day, the recommendation handler and any prop
  // overrides under test layered on.
  const renderTracker = (day: DayPayload, handlers: { onRecommend?: () => void },
                          props: Partial<{ isToday: boolean; closed: boolean; maxMealsPerDay: number;
                                           firstMealHour: number; mealGapHours: number }> = {}) =>
    render(<DayTracker suggestBeforeHours={1} treatDay={TREAT_DAY} maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} closeFrom={CLOSE_FROM} stretchesUntil={STRETCHES_UNTIL}
                       questionnaire={questionnaire} day={day} onReopenDay={vi.fn()}
                       firstMealHour={NO_NUDGE_HOUR} mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()}
                       {...handlers} {...props} />);

  it("offers it beside the add-meal heading on an open day under the cap and hands the press to the app", () => {
    const onRecommend = vi.fn();
    renderTracker(trackedDay, { onRecommend });

    const button = screen.getByRole("button", BUTTON);
    expect(button.closest(".section-header")).toContainElement(screen.getByRole("button", { name: "הוספת ארוחה" }));
    fireEvent.click(button);

    expect(onRecommend).toHaveBeenCalledTimes(1);
  });

  afterEach(() => vi.useRealTimers());

  it("reads greyed while the next meal is further off than the lead, and plain once within it", () => {
    // A four-hour gap and a one-hour lead: the button turns plain three hours after the meal.
    atLocalTime(15, 0);
    renderTracker(dayWithMealHoursAgo(2.9), { onRecommend: vi.fn() }, { mealGapHours: 4 });
    expect(screen.getByRole("button", BUTTON)).toHaveClass("next-meal-early");

    cleanup();
    renderTracker(dayWithMealHoursAgo(3), { onRecommend: vi.fn() }, { mealGapHours: 4 });
    expect(screen.getByRole("button", BUTTON)).not.toHaveClass("next-meal-early");
  });

  it("on an empty day reads greyed until the lead before the first-meal hour", () => {
    atLocalTime(9, 59);
    renderTracker(emptyDay, { onRecommend: vi.fn() }, { firstMealHour: 11 });
    expect(screen.getByRole("button", BUTTON)).toHaveClass("next-meal-early");

    cleanup();
    atLocalTime(10, 0);
    renderTracker(emptyDay, { onRecommend: vi.fn() }, { firstMealHour: 11 });
    expect(screen.getByRole("button", BUTTON)).not.toHaveClass("next-meal-early");
  });

  it("withholds it without a handler, while the form is open, on yesterday, on a closed day, and at the meal cap", () => {
    renderTracker(trackedDay, {});
    expect(screen.queryByRole("button", BUTTON)).not.toBeInTheDocument();

    cleanup();
    renderTracker(trackedDay, { onRecommend: vi.fn() });
    const toggle = screen.getByRole("button", { name: "הוספת ארוחה" });
    toggle.focus();
    fireEvent.click(toggle);
    expect(screen.queryByRole("button", BUTTON)).not.toBeInTheDocument();
    // The header keeps its shape, so the toggle just pressed is the same element, still focused.
    expect(screen.getByRole("button", { name: "הוספת ארוחה" })).toBe(toggle);
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", BUTTON)).toBeInTheDocument();

    cleanup();
    renderTracker(trackedDay, { onRecommend: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 09:10" }));
    expect(screen.getByRole("heading", { name: "עדכון ארוחה" })).toBeInTheDocument();
    expect(screen.queryByRole("button", BUTTON)).not.toBeInTheDocument();

    cleanup();
    renderTracker(trackedDay, { onRecommend: vi.fn() }, { isToday: false });
    expect(screen.queryByRole("button", BUTTON)).not.toBeInTheDocument();

    cleanup();
    renderTracker(trackedDay, { onRecommend: vi.fn() }, { closed: true });
    expect(screen.queryByRole("button", BUTTON)).not.toBeInTheDocument();

    cleanup();
    renderTracker(threeMealDay, { onRecommend: vi.fn() }, { maxMealsPerDay: 3 });
    expect(screen.queryByRole("button", BUTTON)).not.toBeInTheDocument();
  });
});
