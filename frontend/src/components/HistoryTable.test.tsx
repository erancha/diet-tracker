import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryTable } from "./HistoryTable";
import { fixtureQuestionnaire, trackerQuestionnaire } from "../test-fixtures";

const days = [
  { date: "2026-08-17", answers: { drinking: 2 } },
];

const noDelete = { deletableDates: new Set<string>(), onDelete: () => {},
  todayDate: "2026-08-21", onView: () => {} };

describe("HistoryTable", () => {
  it("marks a violating exact-match answer with its choice label", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} {...noDelete} />);
    expect(screen.getByText("פחות מ-2.5 ליטר !!")).toHaveClass("violation");
  });

  it("exposes a question's tooltip on its column header", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} {...noDelete} />);
    expect(screen.getByText("חלון אכילה")).toHaveAttribute("title", "מהארוחה הראשונה עד האחרונה");
  });

  it("renders a dash for questions without an answer", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} {...noDelete} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("deletes only after the user confirms a dialog naming the row's date", async () => {
    const onDelete = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days}
      {...noDelete} deletableDates={new Set(["2026-08-17"])} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "מחיקת הרשומה של 2026-08-17" }));
    expect(confirmSpy).toHaveBeenCalledWith("למחוק את הרשומה של 2026-08-17?");
    expect(onDelete).toHaveBeenCalledWith("2026-08-17");
  });

  it("does not delete when the user dismisses the confirm dialog", async () => {
    const onDelete = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days}
      {...noDelete} deletableDates={new Set(["2026-08-17"])} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "מחיקת הרשומה של 2026-08-17" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("omits the delete button for dates outside the deletable window", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} {...noDelete} />);
    expect(screen.queryByRole("button", { name: /מחיקת/ })).not.toBeInTheDocument();
  });

  it("makes the whole score summary cell the view control for a past day", async () => {
    const onView = vi.fn();
    render(<HistoryTable questionnaire={trackerQuestionnaire}
      days={[{ date: "2026-08-17", answers: { carbs: 4, drinking: 3 } }]}
      {...noDelete} onView={onView} />);
    const cell = screen.getByRole("button", { name: "הצגת היומן של 2026-08-17" });
    expect(cell.tagName).toBe("TD");
    expect(cell).toHaveTextContent("4");
    await userEvent.click(cell);
    expect(onView).toHaveBeenCalledWith("2026-08-17");
  });

  it("omits the view button for today's row, whose live tracker is already open", () => {
    render(<HistoryTable questionnaire={trackerQuestionnaire}
      days={[{ date: "2026-08-21", answers: { carbs: 4, drinking: 3 } }]} {...noDelete} />);
    expect(screen.queryByRole("button", { name: /הצגת היומן/ })).not.toBeInTheDocument();
  });

  it("reddens a score above 30% of the max; the violation background never reaches the score column", () => {
    render(<HistoryTable questionnaire={trackerQuestionnaire}
      days={[{ date: "2026-08-16", answers: { carbs: 10, drinking: 3 } },
             { date: "2026-08-15", answers: { carbs: 9, drinking: 3 } }]} {...noDelete} />);
    const high = screen.getByRole("button", { name: "הצגת היומן של 2026-08-16" });
    expect(high).toHaveClass("high-score");
    expect(high).not.toHaveClass("violation");
    const low = screen.getByRole("button", { name: "הצגת היומן של 2026-08-15" });
    expect(low).not.toHaveClass("high-score");
    expect(low).not.toHaveClass("violation");
  });
});
