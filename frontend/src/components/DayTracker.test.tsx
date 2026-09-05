import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayTracker } from "./DayTracker";
import type { DayPayload } from "../types";
import { STORAGE_KEY as GRADE_LABELS_KEY } from "../gradeLabels";
import { dashboardFigure, trackedDay, trackerQuestionnaire as questionnaire } from "../test-fixtures";

const emptyDay: DayPayload = {
  date: "2026-08-20", meals: [],
  derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 },
};

// A day whose single meal was recorded the given number of hours before the test runs.
const dayWithMealHoursAgo = (hours: number): DayPayload => ({
  date: "2026-08-20",
  meals: [{ id: "m", at: new Date(Date.now() - hours * 3_600_000).toISOString(),
            carbs_choice: "no_carbs", vegetables: false, fruit: false, additions: [], portion: null, second_source: null }],
  derived: { carbs: 0, meals: 1, vegetables: 0, eating_window: 0 },
});

// trackedDay with a derived copy that contradicts its meals: the tracker must recompute from
// the meals it renders rather than trust the payload's copy.
const staleDerivedDay: DayPayload = {
  ...trackedDay,
  derived: { carbs: 99, meals: 9, vegetables: 9, eating_window: 9 },
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
            fruit: false, additions: [], portion: null, second_source: null }],
  derived: { carbs: 4, meals: 3, vegetables: 1, eating_window: 8 },
};

// Pins the clock: the meal form's default time is derived from it, as are the future-time guard
// on the submit button and the hour that starts the add-meal nudge on an unrecorded day.
const atLocalTime = (hour: number, minute = 0) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 20, hour, minute));
};

// Past every hour a clock can report, so cases not about the first-meal nudge always arrive
// with a quiet toggle, whatever hour they pin — or leave unpinned.
const NO_NUDGE_HOUR = 24;

// Longer than any gap a clock can open, so cases not about the stale-meal nudge always arrive
// with a quiet toggle, however old the day fixture's meals are.
const NO_NUDGE_GAP_HOURS = Infinity;

// Higher than any fixture day's meal list, so cases not about the daily cap never fold the
// recording inputs away.
const NO_CAP_MEALS = Infinity;

// The meal-form section, read off its toggle: where the nudge classes land.
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

  // Grade labels open spelled out by default, while the cases here read grades by their short
  // names; pinning the trimmed density keeps those readings stable, and the default itself is
  // asserted by the case that clears this pin.
  beforeEach(() => window.localStorage.setItem(GRADE_LABELS_KEY, "false"));

  it("starts expanded on an empty day whatever the hour", () => {
    atLocalTime(9);
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "יומן היום" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("starts expanded however recently the last meal was recorded", () => {
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={dayWithMealHoursAgo(1)}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "יומן היום" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("derives the dashboard from the recorded meals, not the payload's derived copy", () => {
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={staleDerivedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(dashboardFigure("ציון")).toHaveTextContent("ציון: 4");
    expect(dashboardFigure("ארוחות")).toHaveTextContent("ארוחות: 2");
    expect(dashboardFigure("ירקות")).toHaveTextContent("ירקות: 1");
    expect(dashboardFigure("חלון")).toHaveTextContent("חלון: 5 שעות");
  });

  it("close-day submits values derived from the recorded meals", () => {
    const onCloseDay = vi.fn();
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={wideWindowDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={onCloseDay} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    fireEvent.click(screen.getByRole("button", { name: "אישור וסגירה" }));
    expect(onCloseDay).toHaveBeenCalledWith({
      carbs: 4, meals: 2, vegetables: 1, eating_window: 7, drinking: 3 });
  });

  it("renders each meal's time in bold", () => {
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const time = screen.getByText("09:10");
    expect(time.tagName).toBe("STRONG");
  });

  it("titles the per-meal carbs picker with the meal-level text, not the score summary", () => {
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    expect(screen.getByText("פחמימות (דרגת הארוחה)")).toBeInTheDocument();
    expect(screen.queryByText("פחמימות (סיכום ציון)")).toBeNull();
  });

  it("records a meal with the picked grade, vegetables, fruit and additions", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
      carbs_choice: "carb_grade_4", vegetables: true, fruit: true, additions: ["sweet", "alcohol"], portion: null, second_source: null }));
    // Carries a UTC offset — the test runs on an arbitrary real date, with the clock unpinned.
    expect(onAddMeal.mock.calls[0][0].at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it("offers the portion picker only on grades worth splitting by helping", () => {
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
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

  it("offers a second source only beside a light primary, over every grade but the plain no-carb one", () => {
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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

  it("drops the second source when the primary grade turns heavy", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 2"));
    revealSecondSource();
    fireEvent.click(secondSourceGroup().getByLabelText("דרגה 7"));
    fireEvent.click(primaryGroup().getByLabelText("דרגה 4"));
    // The group folded with its grade: a plate the contract bars from a second source keeps none.
    expect(screen.queryByRole("group", { name: "מקור פחמימה נוסף" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({
      carbs_choice: "carb_grade_4", second_source: null }));
  });

  it("records no second source once the group is removed", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={twoSourceDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={onUpdateMeal}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    expect(secondSourceGroup().getByLabelText("דרגה 7")).toBeChecked();
    expect(screen.getByLabelText(/גודל המנה/)).toHaveValue("small");
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));
    expect(onUpdateMeal).toHaveBeenCalledWith("b", expect.objectContaining({
      second_source: { carbs_choice: "carb_grade_7", portion: "small" } }));
  });

  it("records the picked choice id even when another choice shares its numeric value", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
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
      carbs_choice: "carb_grade_4", vegetables: true, fruit: true, additions: ["sweet"], portion: null, second_source: null }));
    expect(onUpdateMeal.mock.calls[0][1].at).toMatch(/T12:00:00[+-]\d{2}:\d{2}$/);
    expect(screen.queryByRole("button", { name: "עדכון ארוחה" })).toBeNull();
  });

  it("cancels an untouched edit without a dialog and restores the default meal time", () => {
    atLocalTime(19, 5);
    const onUpdateMeal = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={onUpdateMeal} onDeleteMeal={vi.fn()}
                       onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    expect(screen.getByRole("button", { name: "יציאה מעריכה" })).not.toHaveClass("destructive");
    fireEvent.click(screen.getByRole("button", { name: "יציאה מעריכה" }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onUpdateMeal).not.toHaveBeenCalled();
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("19:05");
    expect(screen.getByLabelText("דרגה 4")).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "עדכון ארוחה" })).toBeNull();
  });

  it("keeps a diverged edit when its discard dialog is dismissed", () => {
    atLocalTime(19, 5);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()}
                       onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "ביטול שינויים" }));
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "עדכון ארוחה" })).toBeNull();
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("19:05");
  });

  it("treats a re-picked addition as a divergence worth confirming", () => {
    atLocalTime(19, 5);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
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
      <DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
                  firstMealHour={NO_NUDGE_HOUR}
                  mealGapHours={NO_NUDGE_GAP_HOURS}
                  onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()}
                  onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));

    rerender(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire}
                         firstMealHour={NO_NUDGE_HOUR}
                         mealGapHours={NO_NUDGE_GAP_HOURS}
                         day={{ ...trackedDay, meals: [trackedDay.meals[0]] }}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()}
                         onCloseDay={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "עדכון ארוחה" })).toBeNull();
    expect(screen.getByRole("button", { name: "הוספת ארוחה" })).toBeInTheDocument();
  });

  it("collapses to the dashboard alone and expands back on header toggle", () => {
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={wideWindowDay}
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
    expect(screen.queryByText("דרגה 4")).toBeNull();

    fireEvent.click(toggle);
    openMealForm();
    expect(screen.getByLabelText("דרגה 4")).toBeInTheDocument();
  });

  it("starts with the meal inputs folded behind the actions and the meal list", () => {
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={wideWindowDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={4}
                       day={dayWithMealHoursAgo(3)}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(mealFormSection()).toHaveClass("meal-form", { exact: true });
  });

  it("keeps the inputs folded but blinks the toggle once the gap since the last meal passed", () => {
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={4}
                       day={dayWithMealHoursAgo(5)}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(mealFormSection()).toHaveClass("nudge-0");
  });

  it("stops the nudge once a fresh meal lands in the day's list", () => {
    const props = { questionnaire, firstMealHour: NO_NUDGE_HOUR, mealGapHours: 4,
                    onAddMeal: vi.fn(), onUpdateMeal: vi.fn(), onDeleteMeal: vi.fn(),
                    onCloseDay: vi.fn() };
    const { rerender } = render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} {...props} day={dayWithMealHoursAgo(5)} />);
    expect(mealFormSection()).toHaveClass("nudge-0");

    rerender(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} {...props} day={dayWithMealHoursAgo(1)} />);

    expect(mealFormSection()).toHaveClass("meal-form", { exact: true });
  });

  it("blinks the toggle from the first-meal hour on a day with nothing recorded", () => {
    atLocalTime(11);
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
                       firstMealHour={11}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(mealFormSection()).toHaveClass("meal-form", { exact: true });
  });

  it("keeps the toggle quiet past the hour once the day has a recorded meal", () => {
    atLocalTime(15);
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={11}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(mealFormSection()).toHaveClass("meal-form", { exact: true });
  });

  it("pauses the nudge while the inputs are open and resumes it when they fold again", () => {
    atLocalTime(11);
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.click(screen.getByRole("button", { name: "שמירת ארוחה" }));

    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("leaves the meal inputs open when an edit is cancelled", () => {
    atLocalTime(19, 5);
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.click(screen.getByRole("button", { name: "יציאה מעריכה" }));

    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("שעת הארוחה")).toBeInTheDocument();
  });

  it("leaves an untouched edit when the meal inputs are folded away", () => {
    atLocalTime(19, 5);
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    expect(screen.getByLabelText("דרגה 4")).toBeChecked();
  });

  it("resets a half-composed meal once the fold's dialog is confirmed", () => {
    atLocalTime(19, 5);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const score = dashboardFigure("ציון");
    expect(score.tagName).toBe("STRONG");
    expect(score.parentElement!.lastElementChild).toBe(score);
  });

  it("exposes the carbs tooltip on the dashboard score", () => {
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(dashboardFigure("ציון")).toHaveAttribute("title", "המטרה היא ציון נמוך");
  });

  it("shows the day's derived values and meal list with delete", () => {
    const onDeleteMeal = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={onDeleteMeal} onCloseDay={vi.fn()} />);
    expect(dashboardFigure("ציון")).toHaveTextContent("ציון: 4");
    expect(dashboardFigure("ארוחות")).toHaveTextContent("ארוחות: 2");
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
    const props = { maxMealsPerDay: NO_CAP_MEALS, closeMinWindowHours: 6, questionnaire, day: trackedDay,
                    firstMealHour: NO_NUDGE_HOUR, mealGapHours: NO_NUDGE_GAP_HOURS,
                    onAddMeal: vi.fn(), onUpdateMeal: vi.fn(), onDeleteMeal: vi.fn(),
                    onCloseDay: vi.fn() };
    const { rerender } = render(<DayTracker {...props} deletingMealId="b" />);
    expect(screen.getByRole("button", { name: "מחיקת ארוחה 13:30" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "מחיקת ארוחה 09:10" })).toBeEnabled();

    // A failed deletion clears the in-flight id without removing the row; its button must come
    // back rather than stay locked on a meal that still exists.
    rerender(<DayTracker {...props} deletingMealId={undefined} />);
    expect(screen.getByRole("button", { name: "מחיקת ארוחה 13:30" })).toBeEnabled();
  });

  it("lists meals in time order, oldest first", () => {
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const times = screen.getAllByText(/^\d{2}:\d{2}$/).map((el) => el.textContent);
    expect(times).toEqual(["09:10", "13:30"]);
  });

  it("shows each meal's effective points at the end of its row", () => {
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByText("09:10").closest("li")).toHaveTextContent("ללא פחמימות · 🥗 · 0");
    expect(screen.getByText("13:30").closest("li")).toHaveTextContent("דרגה 4 · 🍎 · 4");
  });

  it("gives each meal's time its own cell, so a wrapped description never runs under it", () => {
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const row = screen.getByText("13:30").closest("li")!;
    const cell = Array.from(row.children).find((el) => el.classList.contains("meal-points"));
    expect(cell).toHaveAttribute("title", "המטרה היא ציון נמוך");
  });

  it("shows a marker per addition on a recorded meal", () => {
    const additionsDay: DayPayload = {
      date: "2026-08-20",
      meals: [{ id: "a", at: "2026-08-20T09:10:00+03:00", carbs_choice: "carb_grade_4",
                vegetables: false, fruit: false, additions: ["sweet", "alcohol", "nuts", "fat"], portion: null, second_source: null }],
      derived: { carbs: 17, meals: 1, vegetables: 0, eating_window: 0 },
    };
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={additionsDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByText("09:10").closest("li"))
      .toHaveTextContent("דרגה 4 · 🍪 · 🍷 · 🥜 · 🥑 · 17");
  });

  it("marks each meal's row controls with the compact icon-only style", () => {
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    for (const button of screen.getAllByRole("button", { name: /מחיקת ארוחה|עריכת ארוחה/ })) {
      expect(button).toHaveClass("icon-only");
    }
  });

  it("close-day asks for water and submits derived values plus drinking", () => {
    const onCloseDay = vi.fn();
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={wideWindowDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={onCloseDay} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    fireEvent.click(screen.getByRole("button", { name: "אישור וסגירה" }));
    expect(onCloseDay).toHaveBeenCalledWith({
      carbs: 4, meals: 2, vegetables: 1, eating_window: 7, drinking: 3 });
  });

  it("the close-day button leaves once its panel opens, so the flow ends in the confirm", () => {
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={wideWindowDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={wideWindowDay}
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
    const props = { maxMealsPerDay: NO_CAP_MEALS, closeMinWindowHours: 6, questionnaire, day: wideWindowDay,
                    firstMealHour: NO_NUDGE_HOUR, mealGapHours: NO_NUDGE_GAP_HOURS,
                    onAddMeal: vi.fn(), onUpdateMeal: vi.fn(), onDeleteMeal: vi.fn(),
                    onCloseDay: vi.fn(), onReopenDay: vi.fn() };
    const { rerender } = render(<DayTracker {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    fireEvent.click(screen.getByRole("button", { name: "אישור וסגירה" }));

    // The close lands, then the record is deleted — the same instance stays mounted throughout,
    // and the reopened day must greet the user at the start, not inside a stale water panel.
    rerender(<DayTracker {...props} closed />);
    rerender(<DayTracker {...props} closed={false} />);
    expect(screen.queryByRole("button", { name: "אישור וסגירה" })).toBeNull();
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
  });

  it("offers closing at whatever minimum window the config sets", () => {
    // trackedDay spans 4.5 hours: under the repo's six-hour bound, over a configured four.
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={4}
                       questionnaire={questionnaire} day={trackedDay}
                       firstMealHour={NO_NUDGE_HOUR}
                       mealGapHours={NO_NUDGE_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
  });

  it("close-day stays hidden until the recorded meals span six hours", () => {
    const { rerender } = render(
      <DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
                  firstMealHour={NO_NUDGE_HOUR}
                  mealGapHours={NO_NUDGE_GAP_HOURS}
                  onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                  onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(dashboardFigure("חלון")).toHaveTextContent("חלון: 5 שעות");
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();

    rerender(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={wideWindowDay}
                         firstMealHour={NO_NUDGE_HOUR}
                         mealGapHours={NO_NUDGE_GAP_HOURS}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                         onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(dashboardFigure("חלון")).toHaveTextContent("חלון: 7 שעות");
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
  });

  it("folds the close-day panel away when a deletion narrows the window below six hours", () => {
    const { rerender } = render(
      <DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={wideWindowDay}
                  firstMealHour={NO_NUDGE_HOUR}
                  mealGapHours={NO_NUDGE_GAP_HOURS}
                  onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                  onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    expect(screen.getByRole("button", { name: "אישור וסגירה" })).toBeInTheDocument();

    rerender(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={trackedDay}
                         firstMealHour={NO_NUDGE_HOUR}
                         mealGapHours={NO_NUDGE_GAP_HOURS}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                         onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "אישור וסגירה" })).toBeNull();
  });

  it("close-day saves the composed meal itself and continues into closing", () => {
    const onAddMeal = vi.fn();
    const onCloseDay = vi.fn();
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={wideWindowDay}
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
      carbs: 4, meals: 2, vegetables: 1, eating_window: 7, drinking: 3 });
  });

  it("close-day locks only while the composed meal cannot be saved yet", () => {
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={wideWindowDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={wideWindowDay}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={wideWindowDay}
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

  it("close-day appears only once two meals are recorded", () => {
    const singleMealDay: DayPayload = {
      date: "2026-08-20",
      meals: [trackedDay.meals[0]],
      derived: { carbs: 0, meals: 1, vegetables: 1, eating_window: 0 },
    };
    const { rerender } = render(
      <DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={emptyDay}
                  firstMealHour={NO_NUDGE_HOUR}
                  mealGapHours={NO_NUDGE_GAP_HOURS}
                  onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                  onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();

    rerender(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={singleMealDay}
                         firstMealHour={NO_NUDGE_HOUR}
                         mealGapHours={NO_NUDGE_GAP_HOURS}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                         onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();

    rerender(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={wideWindowDay}
                         firstMealHour={NO_NUDGE_HOUR}
                         mealGapHours={NO_NUDGE_GAP_HOURS}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                         onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
  });

  // trackedDay holds two meals, so a cap of two is the day at its quota and three is under it.
  const renderWithCap = (maxMealsPerDay: number) =>
    render(<DayTracker maxMealsPerDay={maxMealsPerDay} closeMinWindowHours={6} questionnaire={questionnaire}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire} day={payload}
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
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire}
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
    expect(screen.queryByRole("button", { name: /עריכת ארוחה/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /מחיקת ארוחה/ })).toBeNull();
    // The density switch stays: the read-only rows still name grades worth spelling out.
    expect(screen.getByRole("button", { name: "הרחבת שמות" })).toBeInTheDocument();
  });

  it("reopens the closed day once the eating-window question is confirmed, form ready", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onReopenDay = vi.fn();
    const props = { maxMealsPerDay: NO_CAP_MEALS, closeMinWindowHours: 6, questionnaire, day: trackedDay, onReopenDay,
                    firstMealHour: NO_NUDGE_HOUR, mealGapHours: NO_NUDGE_GAP_HOURS,
                    onAddMeal: vi.fn(), onUpdateMeal: vi.fn(), onDeleteMeal: vi.fn(),
                    onCloseDay: vi.fn() };
    const { rerender } = render(<DayTracker {...props} closed />);
    fireEvent.click(screen.getByRole("button", { name: "הוספת ארוחה" }));
    expect(window.confirm).toHaveBeenCalledWith("האם לפתוח את חלון האכילה מחדש?");
    expect(onReopenDay).toHaveBeenCalledTimes(1);

    // The deletion round-trips and the day comes back open; the inputs the click asked for are
    // already waiting rather than folded behind a second toggle.
    rerender(<DayTracker {...props} closed={false} />);
    expect(screen.getByLabelText("שעת הארוחה")).toBeInTheDocument();
  });

  it("leaves a closed day alone when the reopen question is dismissed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onReopenDay = renderClosed();
    fireEvent.click(screen.getByRole("button", { name: "הוספת ארוחה" }));
    expect(onReopenDay).not.toHaveBeenCalled();
  });

  // From the third recorded meal, one more would cross the meals rule's bound. The warning rides
  // the add-meal controls themselves — the form toggle's label and the closed day's reopen
  // control — before that meal exists to redden a history row.
  const renderWithMeals = (day: DayPayload, closed = false) =>
    render(<DayTracker maxMealsPerDay={NO_CAP_MEALS} closeMinWindowHours={6} questionnaire={questionnaire}
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
                vegetables: false, fruit: false, additions: [], portion: "small",
                second_source: null }],
    });
    expect(dashboardFigure("ציון")).toHaveTextContent("ציון: 4");
  });
});
