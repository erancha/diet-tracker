import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { trackerQuestionnaire } from "../test-fixtures";
import type { Meal, Questionnaire } from "../types";

// The tracker fixture plus the grade a second fruit escalates to, so the escalation term prices.
const questionnaire: Questionnaire = {
  ...trackerQuestionnaire,
  questions: trackerQuestionnaire.questions.map((q) => q.id !== "carbs" ? q
    : { ...q, choices: [...q.choices, { id: "carb_grade_5", label: "דרגה 5", examples: "פירות", value: 5 }] }),
};

// Listed out of time order: the breakdown reads the day as it unfolded, so the late meal with
// the second fruit must come last however the payload lists it.
const meals: Meal[] = [
  { id: "late", at: "2026-08-20T19:00:00+03:00", carbs_choice: "carb_grade_2", vegetables: false, fruit: true,
    additions: [{ id: "sweet", amount: "much" }, { id: "fat", amount: null }], portion: null,
    second_source: { carbs_choice: "carb_grade_7", portion: "medium" } },
  { id: "early", at: "2026-08-20T09:00:00+03:00", carbs_choice: "carb_grade_7", vegetables: true, fruit: true,
    additions: [], portion: "small", second_source: { carbs_choice: "carb_grade_2", portion: null } },
];

// 2026-08-20 is a Thursday: an ordinary day under a Friday treat day, the treat day under a
// Thursday one.
function renderBreakdown(onExpire = vi.fn(), treatWeekday = "FRI") {
  render(<ScoreBreakdown questionnaire={questionnaire} meals={meals} date="2026-08-20"
                         treatDay={{ weekday: treatWeekday }} onExpire={onExpire} />);
  return onExpire;
}

afterEach(() => vi.useRealTimers());

describe("ScoreBreakdown", () => {
  it("lists the meals in time order, each with its priced terms and total", () => {
    renderBreakdown();
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => within(r).getByText(/^\d{2}:\d{2}$/).textContent)).toEqual(["09:00", "19:00"]);
    // 09:00: grade 7 at a small helping (4.2), grade 2 merged into it (lifts nothing).
    expect(rows[0]).toHaveTextContent("דרגה 7 (קמח לבן)");
    expect(rows[0]).toHaveTextContent("מנה קטנה");
    expect(rows[0]).toHaveTextContent("4.2");
    expect(rows[0]).toHaveTextContent("דרגה 2 (קינואה)");
    expect(rows[0]).toHaveTextContent("+ 0");
    // 19:00: grade 2 (2) + grade 7 at a medium helping (5.6), then the second fruit lifts nothing
    // past 7.6, then a heaped sweet (5) and fat (2): 14.6.
    expect(rows[1]).toHaveTextContent("מנה בינונית");
    expect(rows[1]).toHaveTextContent("5.6");
    expect(rows[1]).toHaveTextContent("פרי נוסף");
    expect(rows[1]).toHaveTextContent("כולל מתוק");
    expect(rows[1]).toHaveTextContent("הרבה");
    expect(rows[1]).toHaveTextContent("+ 5");
    expect(rows[1]).toHaveTextContent("כולל שומן");
    expect(rows[1]).toHaveTextContent("+ 2");
    expect(rows[1]).toHaveTextContent("= 14.6");
  });

  it("spells every grade out with its examples whatever density the tracker is set to", () => {
    window.localStorage.setItem("diet-tracker.expanded-grade-labels", "false");
    renderBreakdown();
    expect(screen.getAllByText(/דרגה 7 \(קמח לבן\)/).length).toBeGreaterThan(0);
    window.localStorage.removeItem("diet-tracker.expanded-grade-labels");
  });

  it("sums the day beside the rule bound the score crossed", () => {
    renderBreakdown();
    const foot = screen.getByText(/סה״כ/);
    expect(foot).toHaveTextContent("18.8");
    expect(foot).toHaveTextContent("מעל 8");
  });

  it("paints the sum by the day rule, as the dashboard paints the score", () => {
    renderBreakdown();
    expect(screen.getByText("18.8")).toHaveClass("heavy-day");
    expect(screen.getByText("18.8")).not.toHaveClass("treat-day");
  });

  it("softens the sum's mark on the treat day", () => {
    renderBreakdown(vi.fn(), "THU");
    expect(screen.getByText("18.8")).toHaveClass("heavy-day", "treat-day");
  });

  it("carries no control of its own: the score link that opened it is what closes it", () => {
    renderBreakdown();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("asks to close once its half minute is up, and not before", () => {
    vi.useFakeTimers();
    const onExpire = renderBreakdown();
    act(() => { vi.advanceTimersByTime(29_000); });
    expect(onExpire).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(onExpire).toHaveBeenCalledOnce();
  });
});
