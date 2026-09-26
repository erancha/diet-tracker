import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DayView } from "./DayView";
import { dashboardFigure, trackedDay, trackerQuestionnaire } from "../test-fixtures";

// trackedDay falls on 2026-08-20, a Thursday; the Friday treat day leaves it an ordinary day.
const TREAT_DAY = { weekday: "FRI" };

describe("DayView", () => {
  it("shows the day's date, derived values and meals without any edit controls", () => {
    render(<DayView questionnaire={trackerQuestionnaire} treatDay={TREAT_DAY} expandLabels={false} day={trackedDay} onClose={vi.fn()} />);
    expect(screen.getByText(/יומן ה׳ 20\/08/)).toBeInTheDocument();
    expect(dashboardFigure("חלון")).toHaveTextContent("חלון: 5 שעות");
    expect(dashboardFigure("ציון")).toHaveTextContent("ציון: 4");
    expect(screen.getByText("09:10")).toBeInTheDocument();
    expect(screen.getByText(/דרגה 4/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /מחיקת ארוחה/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /עריכת ארוחה/ })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("lists meals in time order, oldest first", () => {
    render(<DayView questionnaire={trackerQuestionnaire} treatDay={TREAT_DAY} expandLabels={false} day={trackedDay} onClose={vi.fn()} />);
    const times = screen.getAllByText(/^\d{2}:\d{2}$/).map((el) => el.textContent);
    expect(times).toEqual(["09:10", "13:30"]);
  });

  it("states explicitly that a day without meals was not tracked", () => {
    render(<DayView questionnaire={trackerQuestionnaire} treatDay={TREAT_DAY} expandLabels={false}
                    day={{ date: "2026-08-19", meals: [],
                           derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0, fat: 0 } }}
                    onClose={vi.fn()} />);
    expect(screen.getByText("לא נרשמו ארוחות ביום זה")).toBeInTheDocument();
    expect(screen.queryByText(/חלון:/)).toBeNull();
  });

  it("marks the points of a meal reaching the meal bound, and a score reaching the day rule", () => {
    const highDay = { ...trackedDay, derived: { ...trackedDay.derived, carbs: 10 } };
    render(<DayView questionnaire={trackerQuestionnaire} treatDay={TREAT_DAY} expandLabels={false} day={highDay} onClose={vi.fn()} />);
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
    // Grade 0 with a sweet and a drink costs 8 — dearer than the grade 4 plate that reads heavier.
    const day = { ...trackedDay, meals: [
      { ...trackedDay.meals[0],
        additions: [{ id: "sweet", amount: "regular" }, { id: "alcohol", amount: "regular" }] },
      trackedDay.meals[1]] };
    render(<DayView questionnaire={trackerQuestionnaire} treatDay={TREAT_DAY} expandLabels={false} day={day} onClose={vi.fn()} />);
    const points = Array.from(document.querySelectorAll(".meal-points"));
    const laden = points.find((el) => el.textContent?.includes("8"))!;
    expect(laden).toHaveClass("heavy-meal");
  });

  it("leaves a meal under the bound and a score under the day rule unmarked", () => {
    render(<DayView questionnaire={trackerQuestionnaire} treatDay={TREAT_DAY} expandLabels={false} day={trackedDay} onClose={vi.fn()} />);
    expect(dashboardFigure("ציון")).not.toHaveClass("heavy-day");
  });

  it("reports close when its close button is clicked", () => {
    const onClose = vi.fn();
    render(<DayView questionnaire={trackerQuestionnaire} treatDay={TREAT_DAY} expandLabels={false} day={trackedDay} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "סגירת התצוגה" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("softens the viewed day's heavy-day mark when it is the treat day", () => {
    const highDay = { ...trackedDay, derived: { ...trackedDay.derived, carbs: 10 } };
    render(<DayView questionnaire={trackerQuestionnaire} treatDay={{ weekday: "THU" }}
                    expandLabels={false} day={highDay} onClose={vi.fn()} />);
    expect(screen.getByText(/ציון:/)).toHaveClass("heavy-day", "treat-day");
  });
});

describe("DayView score breakdown", () => {
  const heavyDay = { ...trackedDay, derived: { ...trackedDay.derived, carbs: 10 } };

  it("swaps the meal list for the breakdown from the heavy score, and back from it", () => {
    render(<DayView questionnaire={trackerQuestionnaire} treatDay={TREAT_DAY} expandLabels={false} day={heavyDay} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "פירוט הציון" }));
    expect(screen.getByRole("heading", { name: "פירוט הציון" })).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toHaveClass("meal-list");
    fireEvent.click(screen.getByRole("button", { name: "פירוט הציון" }));
    expect(screen.queryByRole("heading", { name: "פירוט הציון" })).toBeNull();
    expect(screen.getByRole("list")).toHaveClass("meal-list");
  });
});
