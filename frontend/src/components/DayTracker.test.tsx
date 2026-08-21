import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DayTracker } from "./DayTracker";
import type { DayPayload, Questionnaire } from "../types";

const questionnaire: Questionnaire = {
  version: 3,
  questions: [
    { id: "drinking", type: "single", text: "שתיה",
      choices: [{ id: "l3", label: "3 ליטר", value: 3 }] },
    { id: "carbs", type: "points", text: "פחמימות", max: 30,
      choices: [{ id: "no_carbs", label: "ללא פחמימות", value: 0 },
                { id: "grade4", label: "דרגה 4", value: 4 },
                { id: "alcohol", label: "~ כוס אלכוהול לא יבש", value: 4 }] },
  ],
  rules: [],
};

const emptyDay: DayPayload = {
  date: "2026-08-20", meals: [],
  derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 },
};

const trackedDay: DayPayload = {
  date: "2026-08-20",
  meals: [
    { id: "a", at: "2026-08-20T09:10:00+03:00", carbs_choice: "no_carbs", vegetables: true },
    { id: "b", at: "2026-08-20T13:30:00+03:00", carbs_choice: "grade4", vegetables: false },
  ],
  derived: { carbs: 4, meals: 2, vegetables: 1, eating_window: 4.3 },
};

describe("DayTracker", () => {
  it("records a meal with the picked grade and vegetables flag", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       onAddMeal={onAddMeal} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "רישום ארוחה" })).toBeNull();
    fireEvent.click(screen.getByLabelText("דרגה 4"));
    fireEvent.click(screen.getByLabelText("כללה ירקות"));
    fireEvent.click(screen.getByRole("button", { name: "רישום ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({
      carbs_choice: "grade4", vegetables: true }));
    // Stamped at tap time with a UTC offset — the test runs on an arbitrary real date.
    expect(onAddMeal.mock.calls[0][0].at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it("records the picked choice id even when another choice shares its numeric value", () => {
    const onAddMeal = vi.fn();
    render(<DayTracker questionnaire={questionnaire} today={emptyDay}
                       onAddMeal={onAddMeal} onDeleteMeal={vi.fn()} onCloseDay={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("~ כוס אלכוהול לא יבש"));
    fireEvent.click(screen.getByRole("button", { name: "רישום ארוחה" }));
    expect(onAddMeal).toHaveBeenCalledWith(expect.objectContaining({ carbs_choice: "alcohol" }));
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

  it("shows the day's derived values and meal list with delete", () => {
    const onDeleteMeal = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       onAddMeal={vi.fn()} onDeleteMeal={onDeleteMeal} onCloseDay={vi.fn()} />);
    expect(screen.getByText(/ציון: 4/)).toBeInTheDocument();
    expect(screen.getByText(/ארוחות: 2/)).toBeInTheDocument();
    expect(screen.getByText("חלון: 4.3 שעות")).toBeInTheDocument();
    expect(screen.getByText("דרגה 4")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /מחיקת ארוחה/ })[1]);
    expect(onDeleteMeal).toHaveBeenCalledWith("b");
  });

  it("close-day asks for water and submits derived values plus drinking", () => {
    const onCloseDay = vi.fn();
    render(<DayTracker questionnaire={questionnaire} today={trackedDay}
                       onAddMeal={vi.fn()} onDeleteMeal={vi.fn()} onCloseDay={onCloseDay} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת יום" }));
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    fireEvent.click(screen.getByRole("button", { name: "אישור וסגירה" }));
    expect(onCloseDay).toHaveBeenCalledWith({
      carbs: 4, meals: 2, vegetables: 1, eating_window: 4.3, drinking: 3 });
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
