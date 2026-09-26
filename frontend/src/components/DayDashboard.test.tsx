import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DayDashboard } from "./DayDashboard";
import type { Questionnaire } from "../types";
import { dashboardFigure, trackedDay, trackerQuestionnaire } from "../test-fixtures";

// Every limit the dashboard can mark, one per figure: the window bounded from above by its rule,
// vegetables bounded from below by theirs, and the score's own rule. The vegetables display floor
// sits above its rule so the two are told apart: the floor marks in the history table alone. The
// meal count is bounded by nothing here, so it stands for the figures that never mark.
const questionnaire: Questionnaire = {
  version: 1,
  questions: [
    { id: "vegetables", type: "single", text: "ירקות", warn_below: 2, choices: [] },
    { id: "fat", type: "single", text: "שומן", warn_below: 2, choices: [] },
    { id: "eating_window", type: "single", text: "חלון", unit: "שעות", choices: [] },
    { id: "carbs", type: "points", text: "פחמימות", max: 30, heavy_meal: 4,
      day_title: "ציון יומי", choices: [] },
  ],
  rules: [
    { id: "window", question_id: "eating_window", above: 12 },
    { id: "heavy", question_id: "carbs", at_least: 8 },
    { id: "no_vegetables", question_id: "vegetables", below: 1 },
    { id: "too_much_fat", question_id: "fat", above: 3 },
  ],
};

// 2026-08-20 is a Thursday, an ordinary day under the Friday treat day.
const TREAT_DAY = { weekday: "FRI" };
const ORDINARY = "2026-08-20";
const TREAT = "2026-08-21";

describe("DayDashboard", () => {
  it("marks a window past its bound and vegetables under their rule", () => {
    render(<DayDashboard questionnaire={questionnaire} treatDay={TREAT_DAY} date={ORDINARY}
                         meals={[]} derived={{ carbs: 9, meals: 3, vegetables: 0, eating_window: 13, fat: 2 }} />);

    expect(screen.getByText("13")).toHaveClass("breach");
    expect(screen.getByText("0")).toHaveClass("breach");
    expect(screen.getByText("9").closest("strong")).toHaveClass("heavy-day");
  });

  it("marks fat servings past their bound and leaves a shortfall unmarked", () => {
    render(<DayDashboard questionnaire={questionnaire} treatDay={TREAT_DAY} date={ORDINARY}
                         meals={[]} derived={{ carbs: 5, meals: 3, vegetables: 2, eating_window: 8, fat: 4 }} />);
    expect(dashboardFigure("שומן")).toHaveTextContent("4");
    expect(screen.getByText("4")).toHaveClass("breach");

    cleanup();
    render(<DayDashboard questionnaire={questionnaire} treatDay={TREAT_DAY} date={ORDINARY}
                         meals={[]} derived={{ carbs: 5, meals: 3, vegetables: 2, eating_window: 8, fat: 1 }} />);
    expect(screen.getByText("1")).not.toHaveClass("breach");
  });

  it("leaves vegetables under their display floor unmarked: the floor is the table's alone", () => {
    render(<DayDashboard questionnaire={questionnaire} treatDay={TREAT_DAY} date={ORDINARY}
                         meals={[]} derived={{ carbs: 5, meals: 3, vegetables: 1, eating_window: 8, fat: 0 }} />);

    expect(screen.getByText("1")).not.toHaveClass("breach");
  });

  it("marks nothing on a day with no meals recorded yet", () => {
    render(<DayDashboard questionnaire={questionnaire} treatDay={TREAT_DAY} date={ORDINARY}
                         meals={[]} derived={{ carbs: 0, meals: 0, vegetables: 0, eating_window: 0, fat: 0 }} />);

    expect(document.querySelectorAll(".breach")).toHaveLength(0);
  });

  it("leaves figures inside their limits unmarked", () => {
    render(<DayDashboard questionnaire={questionnaire} treatDay={TREAT_DAY} date={ORDINARY}
                         meals={[]} derived={{ carbs: 5, meals: 3, vegetables: 2, eating_window: 12, fat: 0 }} />);

    expect(screen.getByText("12")).not.toHaveClass("breach");
    expect(screen.getByText("2")).not.toHaveClass("breach");
    // The meal count is not a figure of the strip: the rows under it are the count.
    expect(screen.queryByText("3")).toBeNull();
  });

  it("marks a treat-day breach like any other, softened by the treat-day class", () => {
    render(<DayDashboard questionnaire={questionnaire} treatDay={TREAT_DAY} date={TREAT}
                         meals={[]} derived={{ carbs: 9, meals: 3, vegetables: 0, eating_window: 13, fat: 2 }} />);

    expect(screen.getByText("13")).toHaveClass("breach", "treat-day");
    expect(screen.getByText("9").closest("strong")).toHaveClass("heavy-day", "treat-day");
    expect(screen.getByText("0")).toHaveClass("breach", "treat-day");
  });

  it("keeps the treat-day class off an ordinary day's marks", () => {
    render(<DayDashboard questionnaire={questionnaire} treatDay={TREAT_DAY} date={ORDINARY}
                         meals={[]} derived={{ carbs: 9, meals: 3, vegetables: 1, eating_window: 13, fat: 0 }} />);

    expect(screen.getByText("13")).not.toHaveClass("treat-day");
    expect(screen.getByText("9").closest("strong")).not.toHaveClass("treat-day");
  });
});

describe("DayDashboard score link", () => {
  const heavy = { carbs: 9, meals: 2, vegetables: 2, eating_window: 8, fat: 0 };
  const light = { carbs: 3, meals: 2, vegetables: 2, eating_window: 8, fat: 0 };

  it("turns a score past the day rule into the control that opens its breakdown", () => {
    const onScoreClick = vi.fn();
    render(<DayDashboard questionnaire={questionnaire} treatDay={TREAT_DAY} date={ORDINARY}
                         meals={[]} derived={heavy} onScoreClick={onScoreClick} />);
    const link = screen.getByRole("button", { name: "פירוט הציון" });
    expect(link).toHaveTextContent("9");
    link.click();
    expect(onScoreClick).toHaveBeenCalledOnce();
  });

  it("leaves a score within the rule as plain text even when a handler is offered", () => {
    render(<DayDashboard questionnaire={questionnaire} treatDay={TREAT_DAY} date={ORDINARY}
                         meals={[]} derived={light} onScoreClick={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "פירוט הציון" })).toBeNull();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("keeps a heavy score plain where no breakdown is offered", () => {
    render(<DayDashboard questionnaire={questionnaire} treatDay={TREAT_DAY} date={ORDINARY}
                         meals={[]} derived={heavy} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("DayDashboard flour-and-sugar part", () => {
  it("names the score's flour-and-sugar points beside it", () => {
    const meals = [{ ...trackedDay.meals[1], carbs_choice: "carb_grade_7", fruit: false,
                     additions: [{ id: "sweet", amount: null }] }];
    render(<DayDashboard questionnaire={trackerQuestionnaire} treatDay={TREAT_DAY} date={ORDINARY}
                         meals={meals} derived={{ ...trackedDay.derived, carbs: 11 }} />);
    expect(screen.getByTitle("קמחים וסוכרים")).toHaveTextContent("(11)");
  });

  it("stays silent when no point came from flour or sugar", () => {
    render(<DayDashboard questionnaire={trackerQuestionnaire} treatDay={TREAT_DAY} date={ORDINARY}
                         meals={trackedDay.meals} derived={trackedDay.derived} />);
    expect(screen.queryByTitle("קמחים וסוכרים")).toBeNull();
  });
});
