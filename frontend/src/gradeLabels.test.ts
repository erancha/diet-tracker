import { afterEach, describe, expect, it } from "vitest";
import { choiceLabel, useExpandedGradeLabels } from "./gradeLabels";

describe("choiceLabel", () => {
  it("spells out what a grade covers only at the expanded density", () => {
    const grade = { id: "carb_grade_2", label: "דרגה 2", examples: "קינואה, כוסמת", value: 2 };
    expect(choiceLabel(grade, false)).toBe("דרגה 2");
    expect(choiceLabel(grade, true)).toBe("דרגה 2 (קינואה, כוסמת)");
  });

  it("leaves a choice that names itself completely alone at either density", () => {
    const drink = { id: "l3", label: "3 ליטר", value: 3 };
    expect(choiceLabel(drink, false)).toBe("3 ליטר");
    expect(choiceLabel(drink, true)).toBe("3 ליטר");
  });
});

describe("useExpandedGradeLabels", () => {
  afterEach(() => window.localStorage.clear());

  it("opens spelled out and remembers the reading that was chosen", async () => {
    const { renderHook, act } = await import("@testing-library/react");
    const first = renderHook(() => useExpandedGradeLabels());
    expect(first.result.current[0]).toBe(true);
    act(() => first.result.current[1](false));
    expect(first.result.current[0]).toBe(false);

    // A fresh mount stands for the next visit: the density outlives the one that set it.
    const next = renderHook(() => useExpandedGradeLabels());
    expect(next.result.current[0]).toBe(false);
  });
});
