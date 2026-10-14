import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { trackerQuestionnaire } from "../test-fixtures";
import { STORAGE_KEY as GRADE_LABELS_KEY } from "../gradeLabels";
import type { Meal, Questionnaire } from "../types";

const questionnaire: Questionnaire = trackerQuestionnaire;

// Listed out of time order: the breakdown reads the day as it unfolded, so the late meal with
// the second fruit must come last however the payload lists it.
const meals: Meal[] = [
  { id: "late", at: "2026-08-20T19:00:00+03:00", carbs_choice: "carb_grade_2", vegetables: false, fruit: true,
    fat_servings: 0, additions: [{ id: "sweet", amount: "much" }, { id: "alcohol", amount: null }], portion: null,
    second_source: { carbs_choice: "carb_grade_6", portion: "medium" } },
  { id: "early", at: "2026-08-20T09:00:00+03:00", carbs_choice: "carb_grade_6", vegetables: true, fruit: true,
    fat_servings: 0, additions: [], portion: "small", second_source: { carbs_choice: "carb_grade_2", portion: null } },
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
    // 09:00: grade 6 at a small helping (3.6), grade 2 merged into it (lifts nothing).
    expect(rows[0]).toHaveTextContent("דרגה 6 (קמח לבן)");
    expect(rows[0]).toHaveTextContent("מנה קטנה");
    expect(rows[0]).toHaveTextContent("3.6");
    expect(rows[0]).toHaveTextContent("דרגה 2 (קינואה)");
    expect(rows[0]).toHaveTextContent("+ 0");
    // 19:00: grade 2 (2) + grade 6 at a medium helping (4.8), then the second fruit's surcharge
    // (2), then a heaped sweet (5) and a drink recorded before amounts (4): 17.8.
    expect(rows[1]).toHaveTextContent("מנה בינונית");
    expect(rows[1]).toHaveTextContent("4.8");
    expect(rows[1]).toHaveTextContent("פרי נוסף");
    expect(rows[1]).toHaveTextContent("מתוק");
    expect(rows[1]).toHaveTextContent("הרבה");
    expect(rows[1]).toHaveTextContent("+ 5");
    expect(rows[1]).toHaveTextContent("אלכוהול ממותק");
    expect(rows[1]).toHaveTextContent("+ 4");
    expect(rows[1]).toHaveTextContent("= 17.8");
  });

  it("marks the flour-and-sugar terms, the ones the dashboard's part adds up", () => {
    renderBreakdown();
    // Grade 6 at a small helping, grade 6 as the heavy second source, and the heaped sweet.
    expect([...document.querySelectorAll(".breakdown-points.excluded")].map((e) => e.textContent))
      .toEqual(["3.6", "+ 4.8", "+ 5"]);
  });

  it("spells every grade out with its examples whatever density the tracker is set to", () => {
    window.localStorage.setItem(GRADE_LABELS_KEY, "false");
    renderBreakdown();
    expect(screen.getAllByText(/דרגה 6 \(קמח לבן\)/).length).toBeGreaterThan(0);
    window.localStorage.removeItem(GRADE_LABELS_KEY);
  });

  it("sums the day beside the rule bound the score crossed", () => {
    renderBreakdown();
    const foot = screen.getByText(/סה״כ/);
    expect(foot).toHaveTextContent("21.4");
    expect(foot).toHaveTextContent("מעל 8");
  });

  it("paints the sum by the day rule, as the dashboard paints the score", () => {
    renderBreakdown();
    expect(screen.getByText("21.4")).toHaveClass("heavy-day");
    expect(screen.getByText("21.4")).not.toHaveClass("treat-day");
  });

  it("softens the sum's mark on the treat day", () => {
    renderBreakdown(vi.fn(), "THU");
    expect(screen.getByText("21.4")).toHaveClass("heavy-day", "treat-day");
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
