import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DayTracker } from "./DayTracker";
import type { DayPayload } from "../types";
import { dashboardFigure, trackedDay, trackerQuestionnaire as questionnaire } from "../test-fixtures";

const emptyDay: DayPayload = {
  date: "2026-08-20", meals: [],
  derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 },
};

// A day whose single meal was recorded the given number of hours before the test runs.
const dayWithMealHoursAgo = (hours: number): DayPayload => ({
  date: "2026-08-20",
  meals: [{ id: "m", at: new Date(Date.now() - hours * 3_600_000).toISOString(),
            carbs_choice: "no_carbs", vegetables: false, fruit: false, additions: [], small_portion: false }],
  derived: { carbs: 0, meals: 1, vegetables: 0, eating_window: 0 },
});

// trackedDay with a derived copy that contradicts its meals: the tracker must recompute from
// the meals it renders rather than trust the payload's copy.
const staleDerivedDay: DayPayload = {
  ...trackedDay,
  derived: { carbs: 99, meals: 9, vegetables: 9, eating_window: 9 },
};

// A day wide enough to offer close-day: trackedDay's first meal pushed back into the morning for
// a 6.5-hour window, keeping the contradictory derived copy so the recomputation stays under test.
const wideWindowDay: DayPayload = {
  ...staleDerivedDay,
  meals: [{ ...trackedDay.meals[0], at: "2026-08-20T07:00:00+03:00" }, trackedDay.meals[1]],
};

// Pins the clock: the meal form's default time is derived from it, as are the future-time guard
// on the submit button and the hour that opens the meal inputs on an unrecorded day.
const atLocalTime = (hour: number, minute = 0) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 20, hour, minute));
};

// Past every hour a clock can report, so cases not about the auto-open rule always arrive with
// the meal inputs folded, whatever hour they pin — or leave unpinned.
const NO_AUTO_OPEN_HOUR = 24;

// Longer than any gap a clock can open, so cases not about the stale-meal rule always arrive with
// the meal inputs folded, however old the day fixture's meals are.
const NO_AUTO_OPEN_GAP_HOURS = Infinity;

// The meal inputs start folded, so a test that reaches them opens the section first.
const openMealForm = () =>
  fireEvent.click(screen.getByRole("button", { name: "פרטי הארוחה" }));

describe("DayTracker", () => {
  // Cases here spy on window.confirm; without a restore the spy and its call log outlive the case
  // that installed it, and a later one reads another case's dialog answer as its own.
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("starts expanded on an empty day whatever the hour", () => {
    atLocalTime(9);
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "יומן היום" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("starts expanded however recently the last meal was recorded", () => {
    render(<DayTracker questionnaire={questionnaire} today={dayWithMealHoursAgo(1)}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "יומן היום" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("derives the dashboard from the recorded meals, not the payload's derived copy", () => {
    render(<DayTracker questionnaire={questionnaire} today={staleDerivedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(dashboardFigure("ציון")).toHaveTextContent("ציון: 4");
    expect(dashboardFigure("ארוחות")).toHaveTextContent("ארוחות: 2");
    expect(dashboardFigure("ירקות")).toHaveTextContent("ירקות: 1");
    expect(dashboardFigure("חלון")).toHaveTextContent("חלון: 4.5 שעות");
  });

  it("close-day submits values derived from the recorded meals", () => {
    const onCloseDay = vi.fn();
    render(<DayTracker questionnaire={questionnaire} today={wideWindowDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={onCloseDay} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    fireEvent.click(screen.getByRole("button", { name: "אישור וסגירה" }));
    expect(onCloseDay).toHaveBeenCalledWith({
      carbs: 4, meals: 2, vegetables: 1, eating_window: 6.5, drinking: 3 });
  });

  it("renders each meal's time in bold", () => {
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const time = screen.getByText("09:10");
    expect(time.tagName).toBe("STRONG");
  });

  it("titles the per-meal carbs picker with the meal-level text, not the score summary", () => {
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    expect(screen.getByText("פחמימות (דרגת הארוחה)")).toBeInTheDocument();
    expect(screen.queryByText("פחמימות (סיכום ציון)")).toBeNull();
  });

  it("records a meal with the picked grade, vegetables, fruit and additions", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    expect(screen.queryByRole("button", { name: "רישום ארוחה" })).toBeNull();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.click(screen.getByLabelText("כולל ירקות"));
    fireEvent.click(screen.getByLabelText("כולל פרי"));
    fireEvent.click(screen.getByLabelText("כולל מתוק"));
    fireEvent.click(screen.getByLabelText("כולל אלכוהול לא יבש"));
    fireEvent.click(screen.getByRole("button", { name: "רישום ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({
      carbs_choice: "carb_grade_4", vegetables: true, fruit: true, additions: ["sweet", "alcohol"], small_portion: false }));
    // Carries a UTC offset — the test runs on an arbitrary real date, with the clock unpinned.
    expect(onAddMeal.mock.calls[0][0].at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it("offers the small portion only on grades worth splitting by helping", () => {
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    expect(screen.queryByLabelText("כמות קטנה")).toBeNull();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    expect(screen.queryByLabelText("כמות קטנה")).toBeNull();
    fireEvent.click(screen.getByLabelText("דרגה 7"));
    expect(screen.getByLabelText("כמות קטנה")).toBeInTheDocument();
  });

  it("records the small portion, and drops it when the grade no longer offers one", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 7"));
    fireEvent.click(screen.getByLabelText("כמות קטנה"));
    fireEvent.click(screen.getByRole("button", { name: "רישום ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({
      carbs_choice: "carb_grade_7", small_portion: true }));

    // Recording folds the inputs away, so the second half opens them again.
    openMealForm();
    // Ticked on a grade that offers it, then switched to one that does not: the box goes, and the
    // flag must not travel with the meal that gets recorded instead.
    fireEvent.click(screen.getByLabelText("דרגה 7"));
    fireEvent.click(screen.getByLabelText("כמות קטנה"));
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.click(screen.getByRole("button", { name: "רישום ארוחה" }));
    expect(onAddMeal).toHaveBeenLastCalledWith(expect.objectContaining({
      carbs_choice: "carb_grade_4", small_portion: false }));
  });

  it("records the picked choice id even when another choice shares its numeric value", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4!"));
    fireEvent.click(screen.getByRole("button", { name: "רישום ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({ carbs_choice: "grade4b" }));
  });

  it("defaults the meal time to twenty minutes before the ten-minute mark just passed", () => {
    atLocalTime(12, 25);
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("12:00");
  });

  it("holds the default at midnight during the first twenty minutes of the day", () => {
    atLocalTime(0, 5);
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("00:00");
  });

  it("records a meal at the picked time rather than the submission moment", () => {
    atLocalTime(16, 5);
    const onAddMeal = vi.fn();
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "13:00" } });
    fireEvent.click(screen.getByRole("button", { name: "רישום ארוחה" }));
    expect(onAddMeal.mock.calls[0][0].at).toMatch(/^2026-08-20T13:00:00[+-]\d{2}:\d{2}$/);
  });

  it("returns the meal time to the default estimate after a meal is recorded", () => {
    atLocalTime(16, 5);
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "13:00" } });
    fireEvent.click(screen.getByRole("button", { name: "רישום ארוחה" }));
    // Recording folds the inputs away, so the restored default is read back through the header.
    fireEvent.click(screen.getByRole("button", { name: "פרטי הארוחה" }));
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("15:40");
  });

  it("refuses to record a meal at a time the day has not reached yet", () => {
    atLocalTime(13, 0);
    const onAddMeal = vi.fn();
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "14:00" } });
    expect(screen.getByRole("button", { name: "רישום ארוחה" })).toBeDisabled();
    expect(screen.getByText("לא ניתן לרשום ארוחה בשעה עתידית")).toBeInTheDocument();
  });

  it("loads a recorded meal into the meal form when its edit button is tapped", () => {
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()}
                       onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("13:30");
    expect(screen.getByLabelText("דרגה 4")).toBeChecked();
    expect(screen.getByLabelText("כולל פרי")).toBeChecked();
    expect(screen.getByLabelText("כולל ירקות")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "עדכון ארוחה" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "רישום ארוחה" })).toBeNull();
  });

  it("sends the edited meal under its own id and returns the form to recording", () => {
    atLocalTime(19, 5);
    const onUpdateMeal = vi.fn();
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={onUpdateMeal} onDeleteMeal={vi.fn()}
                       onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByLabelText("כולל ירקות"));
    fireEvent.click(screen.getByLabelText("כולל מתוק"));
    fireEvent.click(screen.getByRole("button", { name: "עדכון ארוחה" }));
    expect(onUpdateMeal).toHaveBeenCalledWith("b", expect.objectContaining({
      carbs_choice: "carb_grade_4", vegetables: true, fruit: true, additions: ["sweet"], small_portion: false }));
    expect(onUpdateMeal.mock.calls[0][1].at).toMatch(/T12:00:00[+-]\d{2}:\d{2}$/);
    expect(screen.queryByRole("button", { name: "עדכון ארוחה" })).toBeNull();
  });

  it("cancels an untouched edit without a dialog and restores the default meal time", () => {
    atLocalTime(19, 5);
    const onUpdateMeal = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={onUpdateMeal} onDeleteMeal={vi.fn()}
                       onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    expect(screen.getByRole("button", { name: "יציאה מעריכה" })).not.toHaveClass("destructive");
    fireEvent.click(screen.getByRole("button", { name: "יציאה מעריכה" }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onUpdateMeal).not.toHaveBeenCalled();
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("18:40");
    expect(screen.getByLabelText("דרגה 4")).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "עדכון ארוחה" })).toBeNull();
  });

  it("keeps a diverged edit when its discard dialog is dismissed", () => {
    atLocalTime(19, 5);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
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
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()}
                       onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "ביטול שינויים" }));
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "עדכון ארוחה" })).toBeNull();
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("18:40");
  });

  it("treats a re-picked addition as a divergence worth confirming", () => {
    atLocalTime(19, 5);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()}
                       onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.click(screen.getByLabelText("כולל מתוק"));
    fireEvent.click(screen.getByRole("button", { name: "ביטול שינויים" }));
    expect(confirmSpy).toHaveBeenCalledOnce();
  });

  it("falls back to recording when the meal being edited is deleted", () => {
    const { rerender } = render(
      <DayTracker questionnaire={questionnaire} today={trackedDay}
                  firstMealHour={NO_AUTO_OPEN_HOUR}
                  mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                  onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()}
                  onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));

    rerender(<DayTracker questionnaire={questionnaire}
                         firstMealHour={NO_AUTO_OPEN_HOUR}
                         mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                         today={{ ...trackedDay, meals: [trackedDay.meals[0]] }}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()}
                         onCloseDay={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "עדכון ארוחה" })).toBeNull();
    expect(screen.getByRole("button", { name: "רישום ארוחה" })).toBeInTheDocument();
  });

  it("collapses to the dashboard alone and expands back on header toggle", () => {
    render(<DayTracker questionnaire={questionnaire} today={wideWindowDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: "יומן היום" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(dashboardFigure("ציון")).toHaveTextContent("ציון: 4");
    expect(screen.queryByRole("button", { name: "רישום ארוחה" })).toBeNull();
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();
    expect(screen.queryByText("דרגה 4")).toBeNull();

    fireEvent.click(toggle);
    openMealForm();
    expect(screen.getByLabelText("דרגה 4")).toBeInTheDocument();
  });

  it("starts with the meal inputs folded behind the actions and the meal list", () => {
    render(<DayTracker questionnaire={questionnaire} today={wideWindowDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("שעת הארוחה")).toBeNull();
    expect(screen.queryByLabelText("דרגה 4")).toBeNull();
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
    expect(screen.getByText("13:30")).toBeInTheDocument();
    expect(dashboardFigure("ציון")).toHaveTextContent("ציון: 4");
  });

  it("keeps the meal inputs folded while the last meal is younger than the gap", () => {
    render(<DayTracker questionnaire={questionnaire}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={4}
                       today={dayWithMealHoursAgo(3)}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("unfolds the meal inputs once the gap since the last meal has passed", () => {
    render(<DayTracker questionnaire={questionnaire}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={4}
                       today={dayWithMealHoursAgo(5)}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("שעת הארוחה")).toBeInTheDocument();
  });

  it("folds the meal inputs away again once the overdue meal is recorded", () => {
    render(<DayTracker questionnaire={questionnaire}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={4}
                       today={dayWithMealHoursAgo(5)}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.click(screen.getByRole("button", { name: "רישום ארוחה" }));

    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("unfolds the meal inputs from the first-meal hour on a day with nothing recorded", () => {
    atLocalTime(11);
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       firstMealHour={11}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("שעת הארוחה")).toBeInTheDocument();
  });

  it("keeps the meal inputs folded before the first-meal hour", () => {
    atLocalTime(10, 59);
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       firstMealHour={11}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the meal inputs folded past the hour once the day has a recorded meal", () => {
    atLocalTime(15);
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={11}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("folds the auto-opened meal inputs away on the header toggle", () => {
    atLocalTime(11);
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       firstMealHour={11}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "פרטי הארוחה" }));
    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("unfolds the meal inputs when a recorded meal is opened for editing", () => {
    render(<DayTracker questionnaire={questionnaire}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       today={dayWithMealHoursAgo(1)}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: /^עריכת ארוחה/ }));

    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "עדכון ארוחה" })).toBeInTheDocument();
  });

  it("folds the meal inputs away once a meal is recorded", () => {
    atLocalTime(19, 5);
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    openMealForm();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.click(screen.getByRole("button", { name: "רישום ארוחה" }));

    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("שעת הארוחה")).toBeNull();
  });

  it("folds the meal inputs away once a correction is sent", () => {
    atLocalTime(19, 5);
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.click(screen.getByRole("button", { name: "עדכון ארוחה" }));

    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("leaves the meal inputs open when an edit is cancelled", () => {
    atLocalTime(19, 5);
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.click(screen.getByRole("button", { name: "יציאה מעריכה" }));

    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("שעת הארוחה")).toBeInTheDocument();
  });

  it("renders the score bold and last in the dashboard", () => {
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const score = dashboardFigure("ציון");
    expect(score.tagName).toBe("STRONG");
    expect(score.parentElement!.lastElementChild).toBe(score);
  });

  it("exposes the carbs tooltip on the dashboard score", () => {
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(dashboardFigure("ציון")).toHaveAttribute("title", "המטרה היא ציון נמוך");
  });

  it("shows the day's derived values and meal list with delete", () => {
    const onDeleteMeal = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={onDeleteMeal} onCloseDay={vi.fn()} />);
    expect(dashboardFigure("ציון")).toHaveTextContent("ציון: 4");
    expect(dashboardFigure("ארוחות")).toHaveTextContent("ארוחות: 2");
    expect(dashboardFigure("חלון")).toHaveTextContent("חלון: 4.5 שעות");
    // The folded inputs leave the carbs picker unrendered, so the only grade text on screen is
    // the recorded meal's own.
    expect(screen.getAllByText("דרגה 4")).toHaveLength(1);
    expect(screen.getByText(/🥗/)).toBeInTheDocument();
    expect(screen.getByText(/🍎/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "מחיקת ארוחה 13:30" }));
    expect(onDeleteMeal).toHaveBeenCalledWith("b");
  });

  it("lists meals newest first", () => {
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const times = screen.getAllByText(/^\d{2}:\d{2}$/).map((el) => el.textContent);
    expect(times).toEqual(["13:30", "09:10"]);
  });

  it("shows each meal's effective points at the end of its row", () => {
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByText("09:10").closest("li")).toHaveTextContent("ללא פחמימות · 🥗 · 0");
    expect(screen.getByText("13:30").closest("li")).toHaveTextContent("דרגה 4 · 🍎 · 4");
  });

  it("gives each meal's time its own cell, so a wrapped description never runs under it", () => {
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const time = screen.getByText("09:10");
    expect(time).toHaveClass("meal-at");
    // The description is a sibling of the time rather than its container, so the row lays the two
    // out as columns and every line of a wrapped description shares one edge.
    expect(time.closest("li")!.querySelector(".meal-text")).not.toHaveTextContent("09:10");
  });

  it("gives each meal's points their own cell so the scores hold a column", () => {
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
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
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
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
                vegetables: false, fruit: false, additions: ["sweet", "alcohol", "nuts", "fat"], small_portion: false }],
      derived: { carbs: 17, meals: 1, vegetables: 0, eating_window: 0 },
    };
    render(<DayTracker questionnaire={questionnaire} today={additionsDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByText("09:10").closest("li"))
      .toHaveTextContent("דרגה 4 · 🍪 · 🍷 · 🥜 · 🥑 · 17");
  });

  it("marks each meal's row controls with the compact icon-only style", () => {
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    for (const button of screen.getAllByRole("button", { name: /מחיקת ארוחה|עריכת ארוחה/ })) {
      expect(button).toHaveClass("icon-only");
    }
  });

  it("close-day asks for water and submits derived values plus drinking", () => {
    const onCloseDay = vi.fn();
    render(<DayTracker questionnaire={questionnaire} today={wideWindowDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={onCloseDay} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    fireEvent.click(screen.getByRole("button", { name: "אישור וסגירה" }));
    expect(onCloseDay).toHaveBeenCalledWith({
      carbs: 4, meals: 2, vegetables: 1, eating_window: 6.5, drinking: 3 });
  });

  it("close-day stays hidden until the recorded meals span six hours", () => {
    const { rerender } = render(
      <DayTracker questionnaire={questionnaire} today={trackedDay}
                  firstMealHour={NO_AUTO_OPEN_HOUR}
                  mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                  onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                  onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(dashboardFigure("חלון")).toHaveTextContent("חלון: 4.5 שעות");
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();

    rerender(<DayTracker questionnaire={questionnaire} today={wideWindowDay}
                         firstMealHour={NO_AUTO_OPEN_HOUR}
                         mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                         onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(dashboardFigure("חלון")).toHaveTextContent("חלון: 6.5 שעות");
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
  });

  it("folds the close-day panel away when a deletion narrows the window below six hours", () => {
    const { rerender } = render(
      <DayTracker questionnaire={questionnaire} today={wideWindowDay}
                  firstMealHour={NO_AUTO_OPEN_HOUR}
                  mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                  onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                  onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    expect(screen.getByRole("button", { name: "אישור וסגירה" })).toBeInTheDocument();

    rerender(<DayTracker questionnaire={questionnaire} today={trackedDay}
                         firstMealHour={NO_AUTO_OPEN_HOUR}
                         mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                         onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "אישור וסגירה" })).toBeNull();
  });

  it("close-day appears only once two meals are recorded", () => {
    const singleMealDay: DayPayload = {
      date: "2026-08-20",
      meals: [trackedDay.meals[0]],
      derived: { carbs: 0, meals: 1, vegetables: 1, eating_window: 0 },
    };
    const { rerender } = render(
      <DayTracker questionnaire={questionnaire} today={emptyDay}
                  firstMealHour={NO_AUTO_OPEN_HOUR}
                  mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                  onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                  onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();

    rerender(<DayTracker questionnaire={questionnaire} today={singleMealDay}
                         firstMealHour={NO_AUTO_OPEN_HOUR}
                         mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                         onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();

    rerender(<DayTracker questionnaire={questionnaire} today={wideWindowDay}
                         firstMealHour={NO_AUTO_OPEN_HOUR}
                         mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                         onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
  });

  it("seats a header aside on the tracker's own title row", () => {
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       firstMealHour={NO_AUTO_OPEN_HOUR}
                       mealGapHours={NO_AUTO_OPEN_GAP_HOURS}
                       headerAside={<span>שאלון מקופל</span>}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const row = screen.getByRole("heading", { name: "יומן היום" }).parentElement!;
    expect(row).toHaveClass("section-header");
    expect(row).toContainElement(screen.getByText("שאלון מקופל"));
  });
});
