import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DayView } from "./DayView";
import { dashboardFigure, trackedDay, trackerQuestionnaire } from "../test-fixtures";

describe("DayView", () => {
  it("shows the day's date, derived values and meals without any edit controls", () => {
    render(<DayView questionnaire={trackerQuestionnaire} day={trackedDay} onClose={vi.fn()} />);
    expect(screen.getByText(/יומן ה׳ 20\/08/)).toBeInTheDocument();
    expect(dashboardFigure("ארוחות")).toHaveTextContent("ארוחות: 2");
    expect(dashboardFigure("ציון")).toHaveTextContent("ציון: 4");
    expect(screen.getByText("09:10")).toBeInTheDocument();
    expect(screen.getByText(/דרגה 4/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /מחיקת ארוחה/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /עריכת ארוחה/ })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("lists meals in time order, oldest first", () => {
    render(<DayView questionnaire={trackerQuestionnaire} day={trackedDay} onClose={vi.fn()} />);
    const times = screen.getAllByText(/^\d{2}:\d{2}$/).map((el) => el.textContent);
    expect(times).toEqual(["09:10", "13:30"]);
  });

  it("states explicitly that a day without meals was not tracked", () => {
    render(<DayView questionnaire={trackerQuestionnaire}
                    day={{ date: "2026-08-19", meals: [],
                           derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 } }}
                    onClose={vi.fn()} />);
    expect(screen.getByText("לא נרשמו ארוחות ביום זה")).toBeInTheDocument();
    expect(screen.queryByText(/ארוחות:/)).toBeNull();
  });

  it("marks the points of a meal reaching the meal bound, and a score reaching the day rule", () => {
    const highDay = { ...trackedDay, derived: { ...trackedDay.derived, carbs: 10 } };
    render(<DayView questionnaire={trackerQuestionnaire} day={highDay} onClose={vi.fn()} />);
    // In time order the no-carb morning meal (0 points) leads; the grade 4 plate after it costs
    // 4 and reaches the bound.
    const [light, heavy] = Array.from(document.querySelectorAll(".meal-points"));
    expect(heavy).toHaveTextContent("4");
    expect(heavy).toHaveClass("heavy-meal");
    expect(light).not.toHaveClass("heavy-meal");
    // The judgement is the plate's price, so the grade name itself carries no verdict.
    expect(screen.getByText(/דרגה 4/)).not.toHaveClass("heavy-meal");
    const score = dashboardFigure("ציון");
    expect(score).toHaveTextContent("ציון: 10");
    expect(score).toHaveClass("heavy-day");
  });

  it("prices a light grade beside its additions, not the grade alone", () => {
    // Grade 0 with a sweet and a fat costs 6 — dearer than the grade 4 plate that reads heavier.
    const day = { ...trackedDay, meals: [
      { ...trackedDay.meals[0], additions: ["sweet", "fat"] }, trackedDay.meals[1]] };
    render(<DayView questionnaire={trackerQuestionnaire} day={day} onClose={vi.fn()} />);
    const points = Array.from(document.querySelectorAll(".meal-points"));
    const laden = points.find((el) => el.textContent?.includes("6"))!;
    expect(laden).toHaveClass("heavy-meal");
  });

  it("leaves a meal under the bound and a score under the day rule unmarked", () => {
    render(<DayView questionnaire={trackerQuestionnaire} day={trackedDay} onClose={vi.fn()} />);
    expect(dashboardFigure("ציון")).not.toHaveClass("heavy-day");
  });

  it("reports close when its close button is clicked", () => {
    const onClose = vi.fn();
    render(<DayView questionnaire={trackerQuestionnaire} day={trackedDay} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת התצוגה" }));
    expect(onClose).toHaveBeenCalled();
  });
});
