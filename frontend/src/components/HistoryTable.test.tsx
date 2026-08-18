import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HistoryTable } from "./HistoryTable";
import { fixtureQuestionnaire } from "../test-fixtures";

const days = [
  { date: "2026-08-17", answers: { drinking: "low", snacks: ["nuts", "fruit"] } },
];

describe("HistoryTable", () => {
  it("marks violating answers and joins multi-answer labels", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} />);
    expect(screen.getByText("פחות מ-2.5 ליטר !!")).toHaveClass("violation");
    expect(screen.getByText("אגוזים · פרי")).toBeInTheDocument();
  });

  it("renders a dash for questions without an answer", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
