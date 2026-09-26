import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MealList } from "./MealList";
import type { Meal } from "../types";
import { trackerQuestionnaire as questionnaire } from "../test-fixtures";

const meals: Meal[] = [
  { id: "a", at: "2026-08-20T09:10:00+03:00", carbs_choice: "no_carbs", vegetables: true, fruit: false,
    fat_servings: 1, additions: [], portion: null, second_source: null },
  { id: "b", at: "2026-08-20T13:30:00+03:00", carbs_choice: "carb_grade_4", vegetables: false, fruit: true,
    fat_servings: 0, additions: [], portion: null, second_source: null },
  { id: "c", at: "2026-08-20T19:00:00+03:00", carbs_choice: "carb_grade_4", vegetables: false, fruit: false,
    fat_servings: 0, additions: [], portion: null, second_source: null },
];

const renderList = (expandLabels = false) => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  render(<MealList questionnaire={questionnaire} meals={meals} expandLabels={expandLabels} />);
};

describe("MealList marker legend", () => {
  afterEach(() => vi.useRealTimers());

  it("names the tapped meal's own markers under it, from any cell of the row, for 1.5 seconds per marker over a second's lead", () => {
    renderList();
    expect(document.querySelector(".marker-legend")).toBeNull();

    fireEvent.click(screen.getByText("09:10"));

    expect(screen.getByText("🥗 ירקות · 🥑 מנת שומן")).toBeInTheDocument();
    expect(screen.queryByText(/🍎 פרי/)).toBeNull();
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.getByText("🥗 ירקות · 🥑 מנת שומן")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(document.querySelector(".marker-legend")).toBeNull();
  });

  it("gives a single marker its 1.5 seconds over the same lead", () => {
    renderList();

    fireEvent.click(screen.getByText("13:30"));

    act(() => vi.advanceTimersByTime(2499));
    expect(screen.getByText("דרגה 4 (אורז לבן) · 🍎 פרי")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(document.querySelector(".marker-legend")).toBeNull();
  });

  it("spells out what the row's grades cover, both carb sources of a plate that drew on two", () => {
    const twoSource: Meal[] = [{ id: "d", at: "2026-08-20T21:40:00+03:00",
      carbs_choice: "carb_grade_2", vegetables: true, fruit: false, fat_servings: 0, additions: [], portion: "full",
      second_source: { carbs_choice: "carb_grade_7", portion: "full" } }];
    render(<MealList questionnaire={questionnaire} meals={twoSource} expandLabels={false} />);

    fireEvent.click(screen.getByText("21:40"));

    expect(screen.getByText("דרגה 2 (קינואה) · דרגה 7 (קמח לבן) · 🥗 ירקות")).toBeInTheDocument();
  });

  it("leaves the grades to the row where the row already spells them out", () => {
    renderList(true);

    fireEvent.click(screen.getByText("13:30"));

    expect(screen.getByText("🍎 פרי")).toBeInTheDocument();
  });

  it("moves the legend to another meal tapped while one still shows, and restarts its moment", () => {
    renderList();

    fireEvent.click(screen.getByText("09:10"));
    act(() => vi.advanceTimersByTime(2500));
    fireEvent.click(screen.getByText("13:30"));
    act(() => vi.advanceTimersByTime(2000));

    expect(screen.getByText("דרגה 4 (אורז לבן) · 🍎 פרי")).toBeInTheDocument();
    expect(screen.queryByText(/🥗 ירקות/)).toBeNull();
  });

  it("shows nothing for a meal carrying no marker, its grade included", () => {
    renderList();

    fireEvent.click(screen.getByText("19:00"));

    expect(document.querySelector(".marker-legend")).toBeNull();
    expect(screen.queryByText(/אורז לבן/)).toBeNull();
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
