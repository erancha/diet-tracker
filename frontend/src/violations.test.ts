import { describe, expect, it } from "vitest";
import { choiceLabel, isViolating, selectedIds, splitChartable, violatingChoiceLabels } from "./violations";
import { fixtureQuestionnaire as q } from "./test-fixtures";

describe("selectedIds", () => {
  it("wraps a single-choice answer in an array", () => {
    expect(selectedIds("a")).toEqual(["a"]);
  });

  it("passes a multi-choice answer through", () => {
    expect(selectedIds(["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("choiceLabel", () => {
  it("resolves a choice id to its label", () => {
    expect(choiceLabel(q, "drinking", "mid")).toBe("3 ליטר");
  });

  it("falls back to the raw id for choices from older questionnaire versions", () => {
    expect(choiceLabel(q, "drinking", "retired_choice")).toBe("retired_choice");
  });
});

describe("isViolating", () => {
  it("flags a violating single answer", () => {
    expect(isViolating(q, "drinking", "low")).toBe(true);
  });

  it("passes a non-violating single answer", () => {
    expect(isViolating(q, "drinking", "mid")).toBe(false);
  });

  it("flags a multi answer containing a violating choice", () => {
    expect(isViolating(q, "snacks", ["fruit", "nuts"])).toBe(true);
  });

  it("passes a multi answer without violating choices", () => {
    expect(isViolating(q, "snacks", ["fruit"])).toBe(false);
  });
});

describe("violatingChoiceLabels", () => {
  it("labels only the violating selections", () => {
    expect(violatingChoiceLabels(q, "snacks", ["nuts", "fruit"])).toBe("אגוזים");
  });
});

describe("splitChartable", () => {
  it("separates fully numeric questions from the rest", () => {
    const { chartable, other } = splitChartable(q);
    expect(chartable.map((question) => question.id)).toEqual(["drinking", "window"]);
    expect(other.map((question) => question.id)).toEqual(["snacks"]);
  });
});
