import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DayView } from "./DayView";
import { trackedDay, trackerQuestionnaire } from "../test-fixtures";

describe("DayView", () => {
  it("shows the day's date, derived values and meals without any edit controls", () => {
    render(<DayView questionnaire={trackerQuestionnaire} day={trackedDay} onClose={vi.fn()} />);
    expect(screen.getByText(/יומן 20\/08/)).toBeInTheDocument();
    expect(screen.getByText(/ארוחות: 2/)).toBeInTheDocument();
    expect(screen.getByText(/ציון: 4/)).toBeInTheDocument();
    expect(screen.getByText("09:10")).toBeInTheDocument();
    expect(screen.getByText(/דרגה 4/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /מחיקת ארוחה/ })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("lists meals newest first", () => {
    render(<DayView questionnaire={trackerQuestionnaire} day={trackedDay} onClose={vi.fn()} />);
    const times = screen.getAllByText(/^\d{2}:\d{2}$/).map((el) => el.textContent);
    expect(times).toEqual(["13:30", "09:10"]);
  });

  it("states explicitly that a day without meals was not tracked", () => {
    render(<DayView questionnaire={trackerQuestionnaire}
                    day={{ date: "2026-08-19", meals: [],
                           derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 } }}
                    onClose={vi.fn()} />);
    expect(screen.getByText("לא נרשמו ארוחות ביום זה")).toBeInTheDocument();
    expect(screen.queryByText(/ארוחות: 0/)).toBeNull();
  });

  it("reddens only the grade text of meals graded above 3, and a total score above 30% of the max", () => {
    const highDay = { ...trackedDay, derived: { ...trackedDay.derived, carbs: 10 } };
    render(<DayView questionnaire={trackerQuestionnaire} day={highDay} onClose={vi.fn()} />);
    const grade = screen.getByText(/דרגה 4/);
    expect(grade.tagName).toBe("SPAN");
    expect(grade).toHaveClass("high-grade");
    expect(screen.getByText("13:30").closest("li")).not.toHaveClass("high-grade");
    expect(screen.getByText(/ללא פחמימות/)).not.toHaveClass("high-grade");
    expect(screen.getByText(/ציון: 10/)).toHaveClass("high-score");
  });

  it("leaves scores at or below the thresholds unhighlighted", () => {
    render(<DayView questionnaire={trackerQuestionnaire} day={trackedDay} onClose={vi.fn()} />);
    expect(screen.getByText(/ציון: 4/)).not.toHaveClass("high-score");
  });

  it("reports close when its close button is clicked", () => {
    const onClose = vi.fn();
    render(<DayView questionnaire={trackerQuestionnaire} day={trackedDay} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת התצוגה" }));
    expect(onClose).toHaveBeenCalled();
  });
});
