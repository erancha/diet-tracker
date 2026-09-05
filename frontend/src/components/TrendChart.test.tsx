import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrendChart } from "./TrendChart";
import { fixtureQuestionnaire } from "../test-fixtures";
import type { Day, DayPayload, Question, Questionnaire } from "../types";

const days: Day[] = [
  { date: "2026-08-17", answers: { drinking: 2, window: 8 } },
  { date: "2026-08-18", answers: { drinking: 3, window: 13 } },
];

// A day-in-progress payload with nothing recorded yet, for tests exercising the submitted-days
// panels rather than the live stand-in.
const emptyToday: DayPayload = {
  date: "2026-08-19", meals: [],
  derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 },
};

// The fixture panels plus a carb-score points panel configured last, mirroring the production
// config where the carbs question follows the single-type questions.
const carbsPanel: Question = {
  id: "carbs", type: "points", text: "פחמימות", panel_qualifier: "ציון", max: 30,
  choices: [{ id: "no_carbs", label: "ללא פחמימות", value: 0 }],
};
const withCarbsPanel: Questionnaire = {
  ...fixtureQuestionnaire,
  questions: [...fixtureQuestionnaire.questions, carbsPanel],
};

describe("TrendChart", () => {
  it("renders one titled panel per chartable question plus the violation legend", () => {
    render(<TrendChart questionnaire={fixtureQuestionnaire} days={days} today={emptyToday} endDate="2026-08-18" />);
    expect(screen.getByText("שתיה (ליטרים)")).toBeInTheDocument();
    expect(screen.getByText("חלון אכילה (שעות)")).toBeInTheDocument();
    expect(screen.getByText("חריגה")).toBeInTheDocument();
  });

  it("wraps each panel in a trend-panel container so panels are visually separated", () => {
    const { container } = render(<TrendChart questionnaire={fixtureQuestionnaire} days={days} today={emptyToday} endDate="2026-08-18" />);
    expect(container.querySelectorAll(".trend-panel")).toHaveLength(2);
  });

  it("renders the violation legend above the panels", () => {
    const { container } = render(<TrendChart questionnaire={fixtureQuestionnaire} days={days} today={emptyToday} endDate="2026-08-18" />);
    const legend = container.querySelector(".trend-legend")!;
    const firstPanel = container.querySelector(".trend-panel")!;
    expect(legend.compareDocumentPosition(firstPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the panels before any day has been submitted", () => {
    const { container } = render(<TrendChart questionnaire={fixtureQuestionnaire} days={[]} today={emptyToday} endDate="2026-08-19" />);
    expect(container.querySelectorAll(".trend-panel")).toHaveLength(2);
  });

  it("charts the carb-score panel first even when it is configured last", () => {
    const { container } = render(<TrendChart questionnaire={withCarbsPanel} days={days} today={emptyToday} endDate="2026-08-18" />);
    const titles = [...container.querySelectorAll(".trend-panel-title")].map((el) => el.textContent);
    expect(titles).toEqual(["פחמימות (ציון)", "שתיה (ליטרים)(חריגה: פחות מ-2.5)", "חלון אכילה (שעות)"]);
  });

  it("shows each ruled panel's configured limit in its title and leaves unruled panels bare", () => {
    const { container } = render(<TrendChart questionnaire={fixtureQuestionnaire} days={days} today={emptyToday} endDate="2026-08-18" />);
    const titles = [...container.querySelectorAll(".trend-panel-title")].map((el) => el.textContent);
    expect(titles).toEqual(["שתיה (ליטרים)(חריגה: פחות מ-2.5)", "חלון אכילה (שעות)"]);
  });

  it("lays each title row out right-to-left so the limit follows the title in reading order", () => {
    const { container } = render(<TrendChart questionnaire={fixtureQuestionnaire} days={days} today={emptyToday} endDate="2026-08-18" />);
    for (const row of container.querySelectorAll(".trend-panel-title")) {
      expect(row.getAttribute("dir")).toBe("rtl");
    }
  });
});
