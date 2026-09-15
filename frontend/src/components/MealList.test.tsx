import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MealList } from "./MealList";
import type { Meal } from "../types";
import { trackerQuestionnaire as questionnaire } from "../test-fixtures";

const meals: Meal[] = [
  { id: "a", at: "2026-08-20T09:10:00+03:00", carbs_choice: "no_carbs", vegetables: true, fruit: false,
    additions: [{ id: "fat", amount: "regular" }], portion: null, second_source: null },
  { id: "b", at: "2026-08-20T13:30:00+03:00", carbs_choice: "carb_grade_4", vegetables: false, fruit: true,
    additions: [], portion: null, second_source: null },
  { id: "c", at: "2026-08-20T19:00:00+03:00", carbs_choice: "carb_grade_4", vegetables: false, fruit: false,
    additions: [], portion: null, second_source: null },
];

const renderList = () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  render(<MealList questionnaire={questionnaire} meals={meals} expandLabels={false} />);
};

describe("MealList marker legend", () => {
  afterEach(() => vi.useRealTimers());

  it("names the tapped meal's own markers under it, from any cell of the row, for 1.5 seconds per marker", () => {
    renderList();
    expect(screen.queryByText(/כולל/)).toBeNull();

    fireEvent.click(screen.getByText("09:10"));

    expect(screen.getByText("🥗 כולל ירקות · 🥑 כולל שומן")).toBeInTheDocument();
    expect(screen.queryByText(/כולל פרי/)).toBeNull();
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.getByText("🥗 כולל ירקות · 🥑 כולל שומן")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText(/כולל/)).toBeNull();
  });

  it("gives a single marker its 1.5 seconds", () => {
    renderList();

    fireEvent.click(screen.getByText("13:30"));

    act(() => vi.advanceTimersByTime(1499));
    expect(screen.getByText("🍎 כולל פרי")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText(/כולל/)).toBeNull();
  });

  it("moves the legend to another meal tapped while one still shows, and restarts its moment", () => {
    renderList();

    fireEvent.click(screen.getByText("09:10"));
    act(() => vi.advanceTimersByTime(2500));
    fireEvent.click(screen.getByText("13:30"));
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByText("🍎 כולל פרי")).toBeInTheDocument();
    expect(screen.queryByText(/כולל ירקות/)).toBeNull();
  });

  it("shows nothing for a meal carrying no marker", () => {
    renderList();

    fireEvent.click(screen.getByText("19:00"));

    expect(screen.queryByText(/כולל/)).toBeNull();
  });
});

describe("MealList row controls", () => {
  it("offers the edit pencil on the last meal alone when asked to limit corrections to it", () => {
    render(<MealList questionnaire={questionnaire} meals={meals} expandLabels={false}
                     onEdit={vi.fn()} editLastOnly />);
    expect(screen.getByRole("button", { name: "עריכת ארוחה 19:00" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "עריכת ארוחה 09:10" })).toBeNull();
    expect(screen.queryByRole("button", { name: "עריכת ארוחה 13:30" })).toBeNull();
  });
});
