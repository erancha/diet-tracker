import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DayDashboard } from "./DayDashboard";
import type { Questionnaire } from "../types";

// Every limit the dashboard can mark, one per figure: the window bounded from above by its rule,
// the vegetables display floor, and the score's own rule. The meal count is bounded by nothing
// here, so it stands for the figures that never mark.
const questionnaire: Questionnaire = {
  version: 1,
  questions: [
    { id: "vegetables", type: "single", text: "ירקות", warn_below: 2, choices: [] },
    { id: "eating_window", type: "single", text: "חלון", unit: "שעות", choices: [] },
    { id: "carbs", type: "points", text: "פחמימות", max: 30, heavy_meal: 4,
      day_title: "ציון יומי", choices: [] },
  ],
  rules: [
    { id: "window", question_id: "eating_window", above: 12, consecutive_days: 3, message: "m" },
    { id: "heavy", question_id: "carbs", at_least: 8, consecutive_days: 2, message: "m" },
  ],
};

describe("DayDashboard", () => {
  it("marks a window past its bound and vegetables under their floor", () => {
    render(<DayDashboard questionnaire={questionnaire}
                         derived={{ carbs: 9, meals: 3, vegetables: 1, eating_window: 13 }} />);

    expect(screen.getByText("13")).toHaveClass("breach");
    expect(screen.getByText("1")).toHaveClass("breach");
    expect(screen.getByText("9").closest("strong")).toHaveClass("heavy-day");
  });

  it("marks nothing on a day with no meals recorded yet", () => {
    render(<DayDashboard questionnaire={questionnaire}
                         derived={{ carbs: 0, meals: 0, vegetables: 0, eating_window: 0 }} />);

    expect(document.querySelectorAll(".breach")).toHaveLength(0);
  });

  it("leaves figures inside their limits unmarked", () => {
    render(<DayDashboard questionnaire={questionnaire}
                         derived={{ carbs: 5, meals: 3, vegetables: 2, eating_window: 12 }} />);

    expect(screen.getByText("12")).not.toHaveClass("breach");
    expect(screen.getByText("2")).not.toHaveClass("breach");
    expect(screen.getByText("3")).not.toHaveClass("breach");
  });
});
