import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

describe("DayTracker", () => {
  it("starts collapsed when the last meal is less than four hours old", () => {
    render(<DayTracker questionnaire={questionnaire} today={dayWithMealHoursAgo(1)}
                       onAddMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "יומן היום" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("starts expanded once four hours have passed since the last meal", () => {
    render(<DayTracker questionnaire={questionnaire} today={dayWithMealHoursAgo(4)}
                       onAddMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "יומן היום" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("renders each meal's time in bold", () => {
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       onAddMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const time = screen.getByText("09:10");
    expect(time.tagName).toBe("STRONG");
  });

  it("titles the per-meal carbs picker with the meal-level text, not the score summary", () => {
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       onAddMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByText("פחמימות (דרגת הארוחה)")).toBeInTheDocument();
    expect(screen.queryByText("פחמימות (סיכום ציון)")).toBeNull();
  });

  it("records a meal with the picked grade, vegetables, fruit and additions", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       onAddMeal={onAddMeal} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "רישום ארוחה" })).toBeNull();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.click(screen.getByLabelText("כולל ירקות"));
    fireEvent.click(screen.getByLabelText("כולל פרי"));
    fireEvent.click(screen.getByLabelText("כולל מתוק"));
    fireEvent.click(screen.getByLabelText("כולל אלכוהול לא יבש"));
    fireEvent.click(screen.getByRole("button", { name: "רישום ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({
      carbs_choice: "grade4", vegetables: true, fruit: true, additions: ["sweet", "alcohol"] }));
    // Stamped at tap time with a UTC offset — the test runs on an arbitrary real date.
    expect(onAddMeal.mock.calls[0][0].at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it("records the picked choice id even when another choice shares its numeric value", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       onAddMeal={onAddMeal} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("דרגה 4!"));
    fireEvent.click(screen.getByRole("button", { name: "רישום ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({ carbs_choice: "grade4b" }));
  });

  it("collapses to the dashboard alone and expands back on header toggle", () => {
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       onAddMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
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

  it("renders the score bold and last in the dashboard", () => {
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       onAddMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    const score = screen.getByText(/ציון: 4/);
    expect(score.tagName).toBe("STRONG");
    expect(score.parentElement!.lastElementChild).toBe(score);
  });

  it("exposes the carbs tooltip on the dashboard score", () => {
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       onAddMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByText(/ציון: 4/)).toHaveAttribute("title", "המטרה היא ציון נמוך");
  });

  it("shows the day's derived values and meal list with delete", () => {
    const onDeleteMeal = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       onAddMeal={vi.fn()} onDeleteMeal={onDeleteMeal} onCloseDay={vi.fn()} />);
    expect(screen.getByText(/ציון: 4/)).toBeInTheDocument();
    expect(screen.getByText(/ארוחות: 2/)).toBeInTheDocument();
    expect(screen.getByText("חלון: 4.5 שעות")).toBeInTheDocument();
    // Once as the carbs picker's radio label, once as the recorded meal's grade text.
    expect(screen.getAllByText("דרגה 4")).toHaveLength(2);
    expect(screen.getByText(/🥗/)).toBeInTheDocument();
    expect(screen.getByText(/🍎/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /מחיקת ארוחה/ })[1]);
    expect(onDeleteMeal).toHaveBeenCalledWith("b");
  });

  it("shows each meal's effective points at the end of its row", () => {
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       onAddMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByText("09:10").closest("li")).toHaveTextContent("ללא פחמימות · 🥗 · 0");
    expect(screen.getByText("13:30").closest("li")).toHaveTextContent("דרגה 4 · 🍎 · 4");
  });

  it("shows a marker per addition on a recorded meal", () => {
    const additionsDay: DayPayload = {
      date: "2026-08-20",
      meals: [{ id: "a", at: "2026-08-20T09:10:00+03:00", carbs_choice: "grade4",
                vegetables: false, fruit: false, additions: ["sweet", "alcohol", "nuts"] }],
      derived: { carbs: 15, meals: 1, vegetables: 0, eating_window: 0 },
    };
    render(<DayTracker questionnaire={questionnaire} today={additionsDay}
                       onAddMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByText("09:10").closest("li"))
      .toHaveTextContent("דרגה 4 · 🍪 · 🍷 · 🥜 · 15");
  });

  it("marks each meal's delete button with the compact delete-meal style", () => {
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       onAddMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    for (const button of screen.getAllByRole("button", { name: /מחיקת ארוחה/ })) {
      expect(button).toHaveClass("delete-meal");
    }
  });

  it("close-day asks for water and submits derived values plus drinking", () => {
    const onCloseDay = vi.fn();
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       onAddMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={onCloseDay} />);
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
      <DayTracker questionnaire={questionnaire} today={emptyDay}
                  onAddMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();

    rerender(<DayTracker questionnaire={questionnaire} today={singleMealDay}
                         onAddMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "סגירת יום" })).toBeNull();

    rerender(<DayTracker questionnaire={questionnaire} today={trackedDay}
                         onAddMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "סגירת יום" })).toBeInTheDocument();
  });
});
