import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryTable } from "./HistoryTable";
import { fixtureQuestionnaire } from "../test-fixtures";

const days = [
  { date: "2026-08-17", answers: { drinking: "low", snacks: ["nuts", "fruit"] } },
];

const noDelete = { deletableDates: new Set<string>(), onDelete: () => {} };

describe("HistoryTable", () => {
  it("marks violating answers and joins multi-answer labels", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} {...noDelete} />);
    expect(screen.getByText("פחות מ-2.5 ליטר !!")).toHaveClass("violation");
    expect(screen.getByText("אגוזים · פרי")).toBeInTheDocument();
  });

  it("renders a dash for questions without an answer", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} {...noDelete} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("reports the row's date when its delete button is clicked", async () => {
    const onDelete = vi.fn();
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days}
      deletableDates={new Set(["2026-08-17"])} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "מחיקת הרשומה של 2026-08-17" }));
    expect(onDelete).toHaveBeenCalledWith("2026-08-17");
  });

  it("omits the delete button for dates outside the deletable window", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} {...noDelete} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
