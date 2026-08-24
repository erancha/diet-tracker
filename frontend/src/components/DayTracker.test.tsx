import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DayTracker } from "./DayTracker";
import type { DayPayload } from "../types";
import { trackedDay, trackerQuestionnaire as questionnaire } from "../test-fixtures";

const emptyDay: DayPayload = {
  date: "2026-08-20", meals: [],
  derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 },
};

// A day whose single meal was recorded the given number of hours before the test runs.
const dayWithMealHoursAgo = (hours: number): DayPayload => ({
  date: "2026-08-20",
  meals: [{ id: "m", at: new Date(Date.now() - hours * 3_600_000).toISOString(),
            carbs_choice: "no_carbs", vegetables: false, fruit: false, additions: [] }],
  derived: { carbs: 0, meals: 1, vegetables: 0, eating_window: 0 },
});

// trackedDay with a derived copy that contradicts its meals: the tracker must recompute from
// the meals it renders rather than trust the payload's copy.
const staleDerivedDay: DayPayload = {
  ...trackedDay,
  derived: { carbs: 99, meals: 9, vegetables: 9, eating_window: 9 },
};

// Pins the clock: the empty-day fold compares the current hour against the start hour, and the
// meal form's default time is derived from it.
const atLocalTime = (hour: number, minute = 0) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 20, hour, minute));
};

describe("DayTracker", () => {
  afterEach(() => vi.useRealTimers());

  it("starts collapsed on an empty day before the tracker start hour", () => {
    atLocalTime(9);
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={12} today={emptyDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "יומן היום" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("starts expanded from the tracker start hour onward on an empty day", () => {
    atLocalTime(12);
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={12} today={emptyDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "יומן היום" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the tracker folded after a recent meal even past the tracker start hour", () => {
    atLocalTime(15);
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={12} today={dayWithMealHoursAgo(1)}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "יומן היום" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("derives the dashboard from the recorded meals, not the payload's derived copy", () => {
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={staleDerivedDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByText(/ציון: 4/)).toBeInTheDocument();
    expect(screen.getByText(/ארוחות: 2/)).toBeInTheDocument();
    expect(screen.getByText(/ירקות: 1/)).toBeInTheDocument();
    expect(screen.getByText("חלון: 4.5 שעות")).toBeInTheDocument();
  });

  it("close-day submits values derived from the recorded meals", () => {
    const onCloseDay = vi.fn();
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={staleDerivedDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={onCloseDay} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    fireEvent.click(screen.getByRole("button", { name: "אישור וסגירה" }));
    expect(onCloseDay).toHaveBeenCalledWith({
      carbs: 4, meals: 2, vegetables: 1, eating_window: 4.5, drinking: 3 });
  });

  it("starts collapsed when the last meal is less than four hours old", () => {
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={dayWithMealHoursAgo(1)}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "יומן היום" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("starts expanded once four hours have passed since the last meal", () => {
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={dayWithMealHoursAgo(4)}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "יומן היום" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("renders each meal's time in bold", () => {
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const time = screen.getByText("09:10");
    expect(time.tagName).toBe("STRONG");
  });

  it("titles the per-meal carbs picker with the meal-level text, not the score summary", () => {
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={emptyDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByText("פחמימות (דרגת הארוחה)")).toBeInTheDocument();
    expect(screen.queryByText("פחמימות (סיכום ציון)")).toBeNull();
  });

  it("records a meal with the picked grade, vegetables, fruit and additions", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={emptyDay}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "רישום ארוחה" })).toBeNull();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.click(screen.getByLabelText("כולל ירקות"));
    fireEvent.click(screen.getByLabelText("כולל פרי"));
    fireEvent.click(screen.getByLabelText("כולל מתוק"));
    fireEvent.click(screen.getByLabelText("כולל אלכוהול לא יבש"));
    fireEvent.click(screen.getByRole("button", { name: "רישום ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({
      carbs_choice: "grade4", vegetables: true, fruit: true, additions: ["sweet", "alcohol"] }));
    // Carries a UTC offset — the test runs on an arbitrary real date, with the clock unpinned.
    expect(onAddMeal.mock.calls[0][0].at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it("records the picked choice id even when another choice shares its numeric value", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={emptyDay}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("דרגה 4!"));
    fireEvent.click(screen.getByRole("button", { name: "רישום ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({ carbs_choice: "grade4b" }));
  });

  it("defaults the meal time to twenty minutes before the ten-minute mark just passed", () => {
    atLocalTime(12, 25);
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={emptyDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("12:00");
  });

  it("holds the default at midnight during the first twenty minutes of the day", () => {
    atLocalTime(0, 5);
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={emptyDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("00:00");
  });

  it("records a meal at the picked time rather than the submission moment", () => {
    atLocalTime(16, 5);
    const onAddMeal = vi.fn();
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={emptyDay}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "13:00" } });
    fireEvent.click(screen.getByRole("button", { name: "רישום ארוחה" }));
    expect(onAddMeal.mock.calls[0][0].at).toMatch(/^2026-08-20T13:00:00[+-]\d{2}:\d{2}$/);
  });

  it("returns the meal time to the default estimate after a meal is recorded", () => {
    atLocalTime(16, 5);
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={emptyDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "13:00" } });
    fireEvent.click(screen.getByRole("button", { name: "רישום ארוחה" }));
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("15:40");
  });

  it("refuses to record a meal at a time the day has not reached yet", () => {
    atLocalTime(13, 0);
    const onAddMeal = vi.fn();
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={emptyDay}
                       onAddMeal={onAddMeal} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "14:00" } });
    expect(screen.getByRole("button", { name: "רישום ארוחה" })).toBeDisabled();
    expect(screen.getByText("לא ניתן לרשום ארוחה בשעה עתידית")).toBeInTheDocument();
  });

  it("loads a recorded meal into the meal form when its edit button is tapped", () => {
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
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
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
                       onAddMeal={vi.fn()} onUpdateMeal={onUpdateMeal} onDeleteMeal={vi.fn()}
                       onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.change(screen.getByLabelText("שעת הארוחה"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByLabelText("כולל ירקות"));
    fireEvent.click(screen.getByLabelText("כולל מתוק"));
    fireEvent.click(screen.getByRole("button", { name: "עדכון ארוחה" }));
    expect(onUpdateMeal).toHaveBeenCalledWith("b", expect.objectContaining({
      carbs_choice: "grade4", vegetables: true, fruit: true, additions: ["sweet"] }));
    expect(onUpdateMeal.mock.calls[0][1].at).toMatch(/T12:00:00[+-]\d{2}:\d{2}$/);
    expect(screen.queryByRole("button", { name: "עדכון ארוחה" })).toBeNull();
  });

  it("cancels an edit without sending it and restores the default meal time", () => {
    atLocalTime(19, 5);
    const onUpdateMeal = vi.fn();
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
                       onAddMeal={vi.fn()} onUpdateMeal={onUpdateMeal} onDeleteMeal={vi.fn()}
                       onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));
    fireEvent.click(screen.getByRole("button", { name: "ביטול עריכה" }));
    expect(onUpdateMeal).not.toHaveBeenCalled();
    expect(screen.getByLabelText("שעת הארוחה")).toHaveValue("18:40");
    expect(screen.getByLabelText("דרגה 4")).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "עדכון ארוחה" })).toBeNull();
  });

  it("falls back to recording when the meal being edited is deleted", () => {
    const { rerender } = render(
      <DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
                  onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()}
                  onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "עריכת ארוחה 13:30" }));

    rerender(<DayTracker questionnaire={questionnaire} trackerStartHour={0}
                         today={{ ...trackedDay, meals: [trackedDay.meals[0]] }}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()} onDeleteMeal={vi.fn()}
                         onCloseDay={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "עדכון ארוחה" })).toBeNull();
    expect(screen.getByRole("button", { name: "רישום ארוחה" })).toBeInTheDocument();
  });

  it("collapses to the dashboard alone and expands back on header toggle", () => {
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: "יומן היום" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/ציון: 4/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "רישום ארוחה" })).toBeNull();
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();
    expect(screen.queryByText("דרגה 4")).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByLabelText("דרגה 4")).toBeInTheDocument();
  });

  it("folds the meal inputs away while keeping the actions and meal list in view", () => {
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const form = screen.getByRole("button", { name: "פרטי הארוחה" });
    expect(form).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(form);

    expect(form).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("שעת הארוחה")).toBeNull();
    expect(screen.queryByLabelText("דרגה 4")).toBeNull();
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
    expect(screen.getByText("13:30")).toBeInTheDocument();
    expect(screen.getByText(/ציון: 4/)).toBeInTheDocument();
  });

  it("opens the meal inputs with the tracker when a meal is due", () => {
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0}
                       today={dayWithMealHoursAgo(4)}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("leaves the meal inputs folded when the tracker is opened by hand", () => {
    atLocalTime(9);
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={12} today={emptyDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "יומן היום" }));

    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("דרגה 4")).toBeNull();
  });

  it("unfolds the meal inputs when a recorded meal is opened for editing", () => {
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0}
                       today={dayWithMealHoursAgo(1)}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "יומן היום" }));
    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: /^עריכת ארוחה/ }));

    expect(screen.getByRole("button", { name: "פרטי הארוחה" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "עדכון ארוחה" })).toBeInTheDocument();
  });

  it("renders the score bold and last in the dashboard", () => {
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const score = screen.getByText(/ציון: 4/);
    expect(score.tagName).toBe("STRONG");
    expect(score.parentElement!.lastElementChild).toBe(score);
  });

  it("exposes the carbs tooltip on the dashboard score", () => {
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByText(/ציון: 4/)).toHaveAttribute("title", "המטרה היא ציון נמוך");
  });

  it("shows the day's derived values and meal list with delete", () => {
    const onDeleteMeal = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={onDeleteMeal} onCloseDay={vi.fn()} />);
    expect(screen.getByText(/ציון: 4/)).toBeInTheDocument();
    expect(screen.getByText(/ארוחות: 2/)).toBeInTheDocument();
    expect(screen.getByText("חלון: 4.5 שעות")).toBeInTheDocument();
    // Once as the carbs picker's radio label, once as the recorded meal's grade text.
    expect(screen.getAllByText("דרגה 4")).toHaveLength(2);
    expect(screen.getByText(/🥗/)).toBeInTheDocument();
    expect(screen.getByText(/🍎/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "מחיקת ארוחה 13:30" }));
    expect(onDeleteMeal).toHaveBeenCalledWith("b");
  });

  it("lists meals newest first", () => {
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const times = screen.getAllByText(/^\d{2}:\d{2}$/).map((el) => el.textContent);
    expect(times).toEqual(["13:30", "09:10"]);
  });

  it("shows each meal's effective points at the end of its row", () => {
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByText("09:10").closest("li")).toHaveTextContent("ללא פחמימות · 🥗 · 0");
    expect(screen.getByText("13:30").closest("li")).toHaveTextContent("דרגה 4 · 🍎 · 4");
  });

  it("gives each meal's points their own cell so the scores hold a column", () => {
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
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
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const row = screen.getByText("13:30").closest("li")!;
    const cell = Array.from(row.children).find((el) => el.classList.contains("meal-points"));
    expect(cell).toHaveAttribute("title", "המטרה היא ציון נמוך");
  });

  it("shows a marker per addition on a recorded meal", () => {
    const additionsDay: DayPayload = {
      date: "2026-08-20",
      meals: [{ id: "a", at: "2026-08-20T09:10:00+03:00", carbs_choice: "grade4",
                vegetables: false, fruit: false, additions: ["sweet", "alcohol", "nuts"] }],
      derived: { carbs: 15, meals: 1, vegetables: 0, eating_window: 0 },
    };
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={additionsDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByText("09:10").closest("li"))
      .toHaveTextContent("דרגה 4 · 🍪 · 🍷 · 🥜 · 15");
  });

  it("marks each meal's delete button with the compact delete-meal style", () => {
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    for (const button of screen.getAllByRole("button", { name: /מחיקת ארוחה/ })) {
      expect(button).toHaveClass("delete-meal");
    }
  });

  it("close-day asks for water and submits derived values plus drinking", () => {
    const onCloseDay = vi.fn();
    render(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
                       onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                       onDeleteMeal={vi.fn()} onCloseDay={onCloseDay} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    fireEvent.click(screen.getByRole("button", { name: "אישור וסגירה" }));
    expect(onCloseDay).toHaveBeenCalledWith({
      carbs: 4, meals: 2, vegetables: 1, eating_window: 4.5, drinking: 3 });
  });

  it("close-day appears only once two meals are recorded", () => {
    const singleMealDay: DayPayload = {
      date: "2026-08-20",
      meals: [trackedDay.meals[0]],
      derived: { carbs: 0, meals: 1, vegetables: 1, eating_window: 0 },
    };
    const { rerender } = render(
      <DayTracker questionnaire={questionnaire} trackerStartHour={0} today={emptyDay}
                  onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                  onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();

    rerender(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={singleMealDay}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                         onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();

    rerender(<DayTracker questionnaire={questionnaire} trackerStartHour={0} today={trackedDay}
                         onAddMeal={vi.fn()} onUpdateMeal={vi.fn()}
                         onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
  });
});
