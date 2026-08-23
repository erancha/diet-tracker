import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrendChart } from "./TrendChart";
import { fixtureQuestionnaire } from "../test-fixtures";
import type { Day } from "../types";

const days: Day[] = [
  { date: "2026-08-17", answers: { drinking: 2, window: 8 } },
  { date: "2026-08-18", answers: { drinking: 3, window: 13 } },
];

describe("TrendChart", () => {
  it("renders one titled panel per chartable question plus the violation legend", () => {
    render(<TrendChart questionnaire={fixtureQuestionnaire} days={days} endDate="2026-08-18" />);
    expect(screen.getByText("שתיה (ליטרים)")).toBeInTheDocument();
    expect(screen.getByText("חלון אכילה (שעות)")).toBeInTheDocument();
    expect(screen.getByText("חריגה")).toBeInTheDocument();
  });

  it("wraps each panel in a trend-panel container so panels are visually separated", () => {
    const { container } = render(<TrendChart questionnaire={fixtureQuestionnaire} days={days} endDate="2026-08-18" />);
    expect(container.querySelectorAll(".trend-panel")).toHaveLength(2);
  });

  it("renders the violation legend above the panels", () => {
    const { container } = render(<TrendChart questionnaire={fixtureQuestionnaire} days={days} endDate="2026-08-18" />);
    const legend = container.querySelector(".trend-legend")!;
    const firstPanel = container.querySelector(".trend-panel")!;
    expect(legend.compareDocumentPosition(firstPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
