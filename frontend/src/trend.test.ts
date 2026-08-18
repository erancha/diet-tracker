import { describe, expect, it } from "vitest";
import { shortForm, ticksFor } from "./trend";
import { fixtureQuestionnaire } from "./test-fixtures";

const drinking = fixtureQuestionnaire.questions[0];
const window_ = fixtureQuestionnaire.questions[1];

describe("shortForm", () => {
  it("shortens an open-ended upper bound", () => {
    expect(shortForm("מעל 12 שעות !!")).toBe("מעל 12");
  });

  it("shortens an open-ended lower bound, keeping the hyphenated prefix", () => {
    expect(shortForm("פחות מ-2.5 ליטר !!")).toBe("פחות מ-2.5");
  });

  it("returns null for a plain quantity label", () => {
    expect(shortForm("3 ליטר")).toBeNull();
  });
});

describe("ticksFor", () => {
  it("picks min, midpoint-nearest, and max choice values with bound-aware labels", () => {
    expect(ticksFor(drinking)).toEqual([
      { value: 2, label: "פחות מ-2.5" },
      { value: 3, label: "3" },
      { value: 4, label: "4" },
    ]);
  });

  it("collapses to two ticks when min and mid coincide", () => {
    expect(ticksFor(window_)).toEqual([
      { value: 8, label: "8" },
      { value: 13, label: "מעל 12" },
    ]);
  });
});
