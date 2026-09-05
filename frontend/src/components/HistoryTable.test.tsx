import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryTable } from "./HistoryTable";
import { fixtureQuestionnaire, trackerQuestionnaire } from "../test-fixtures";

const days = [
  { date: "2026-08-17", answers: { drinking: 2 } },
];

// Every date used below falls inside the default 7-day window ending on this day, so only the
// range tests have to think about the window.
const defaults = {
  today: "2026-08-21",
  deletableDates: new Set<string>(), viewedDate: null, onDelete: () => {}, onView: () => {},
};
// A row offers deletion only where both conditions hold: the date is still deletable and its day
// view is the open one.
const deleting = { deletableDates: new Set(["2026-08-17"]), viewedDate: "2026-08-17" };

describe("HistoryTable", () => {
  it("shows the row date as weekday and DD/MM without the year", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} {...defaults} />);
    expect(screen.getByText("ב׳ 17/08")).toBeInTheDocument();
    expect(screen.queryByText("2026-08-17")).not.toBeInTheDocument();
  });

  // An open-ended bound is not a quantity, so it keeps its wording where other answers reduce to
  // their number — "2" under a ליטר header would claim two litres were drunk.
  it("marks a violating open-ended answer with its choice label", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} {...defaults} />);
    expect(screen.getByText("פחות מ-2.5 ליטר !!")).toHaveClass("violation");
  });

  // A bound label is a sentence, not a quantity. Its cell is marked so the stylesheet can
  // truncate it to the row's single-line height, with the full wording kept in the cell's title.
  it("marks a bound-label cell for truncation, carrying the full wording in its title", () => {
    const measured = [{ date: "2026-08-17", answers: { drinking: 2, window: 8 } }];
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={measured} {...defaults} />);
    const cell = screen.getByText("פחות מ-2.5 ליטר !!");
    expect(cell).toHaveClass("bound");
    expect(cell).toHaveAttribute("title", "פחות מ-2.5 ליטר !!");
    expect(screen.getByText("8")).not.toHaveClass("bound");
    expect(screen.getByText("8")).not.toHaveAttribute("title");
  });

  it("names the unit once in the column header, not in every cell under it", () => {
    const measured = [{ date: "2026-08-17", answers: { drinking: 3, window: 8 } }];
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={measured} {...defaults} />);
    expect(screen.getByText("חלון אכילה (שעות)")).toBeInTheDocument();
    expect(screen.getByText("שתיה (ליטר)")).toBeInTheDocument();
    // Both answers read as the quantity alone; their choice labels would repeat the header.
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("8 שעות")).toBeNull();
    expect(screen.queryByText("3 ליטר")).toBeNull();
  });

  it("exposes a question's tooltip on its column header", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} {...defaults} />);
    expect(screen.getByText("חלון אכילה (שעות)"))
      .toHaveAttribute("title", "מהארוחה הראשונה עד האחרונה");
  });

  it("renders a dash for questions without an answer", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} {...defaults} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("deletes only after the user confirms a dialog naming the row's date", async () => {
    const onDelete = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days}
      {...defaults} {...deleting} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "מחיקת הרשומה של 2026-08-17" }));
    expect(confirmSpy).toHaveBeenCalledWith("למחוק את הרשומה של 2026-08-17?");
    expect(onDelete).toHaveBeenCalledWith("2026-08-17");
  });

  it("does not delete when the user dismisses the confirm dialog", async () => {
    const onDelete = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days}
      {...defaults} {...deleting} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "מחיקת הרשומה של 2026-08-17" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("puts the delete button in the row's last cell, clear of the date", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days}
      {...defaults} {...deleting} />);
    const button = screen.getByRole("button", { name: "מחיקת הרשומה של 2026-08-17" });
    const [, dataRow] = screen.getAllByRole("row");
    expect(button.closest("td")).toBe(dataRow.lastElementChild);
  });

  it("deletes without also opening the day view of the score cell it shares", async () => {
    const onView = vi.fn();
    const onDelete = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<HistoryTable questionnaire={trackerQuestionnaire}
      days={[{ date: "2026-08-17", answers: { carbs: 4, drinking: 3 } }]}
      {...defaults} {...deleting} onDelete={onDelete} onView={onView} />);
    await userEvent.click(screen.getByRole("button", { name: "מחיקת הרשומה של 2026-08-17" }));
    expect(onDelete).toHaveBeenCalledWith("2026-08-17");
    expect(onView).not.toHaveBeenCalled();
  });

  it("omits the delete button for dates outside the deletable window", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days}
      {...defaults} viewedDate="2026-08-17" />);
    expect(screen.queryByRole("button", { name: /מחיקת/ })).not.toBeInTheDocument();
  });

  it("withholds the delete button until the row's own day view is open", () => {
    const { rerender } = render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days}
      {...defaults} deletableDates={deleting.deletableDates} />);
    expect(screen.queryByRole("button", { name: /מחיקת/ })).not.toBeInTheDocument();
    rerender(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} {...defaults} {...deleting} />);
    expect(screen.getByRole("button", { name: "מחיקת הרשומה של 2026-08-17" })).toBeInTheDocument();
  });

  it("makes the whole score summary cell the view control for a past day", async () => {
    const onView = vi.fn();
    render(<HistoryTable questionnaire={trackerQuestionnaire}
      days={[{ date: "2026-08-17", answers: { carbs: 4, drinking: 3 } }]}
      {...defaults} onView={onView} />);
    const cell = screen.getByRole("button", { name: "הצגת היומן של 2026-08-17" });
    expect(cell.tagName).toBe("TD");
    expect(cell).toHaveTextContent("4");
    await userEvent.click(cell);
    expect(onView).toHaveBeenCalledWith("2026-08-17");
  });

  it("offers the read-only view on today's row, whose tracker is gone once the day is closed", async () => {
    const onView = vi.fn();
    render(<HistoryTable questionnaire={trackerQuestionnaire}
      days={[{ date: "2026-08-21", answers: { carbs: 4, drinking: 3 } }]} {...defaults} onView={onView} />);
    await userEvent.click(screen.getByRole("button", { name: "הצגת היומן של 2026-08-21" }));
    expect(onView).toHaveBeenCalledWith("2026-08-21");
  });

  // Spans 30 days back from 2026-08-21: the window edges are 15/08 (7 days), 08/08 (14) and
  // 23/07 (30), and 22/07 lies outside every range the picker offers.
  const spread = ["2026-08-21", "2026-08-15", "2026-08-14", "2026-08-08", "2026-08-07",
                  "2026-07-23", "2026-07-22"].map((date) => ({ date, answers: { drinking: 2 } }));
  const rowDates = () => screen.getAllByRole("row").slice(1).map((row) => row.firstElementChild!.textContent);

  it("shows only the last 7 days until the reader asks for more", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={spread} {...defaults} />);
    expect(rowDates()).toEqual(["ו׳ 21/08", "ש׳ 15/08"]);
  });

  it("reaches back 14 days, then 30, as the reader widens the range", async () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={spread} {...defaults} />);
    await userEvent.click(screen.getByLabelText("14 ימים"));
    expect(rowDates()).toEqual(["ו׳ 21/08", "ש׳ 15/08", "ו׳ 14/08", "ש׳ 08/08"]);
    await userEvent.click(screen.getByLabelText("30 ימים"));
    expect(rowDates()).toEqual(["ו׳ 21/08", "ש׳ 15/08", "ו׳ 14/08", "ש׳ 08/08", "ו׳ 07/08", "ה׳ 23/07"]);
  });

  it("never shows a day older than the widest range offered", async () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={spread} {...defaults} />);
    await userEvent.click(screen.getByLabelText("30 ימים"));
    expect(screen.queryByText("ד׳ 22/07")).not.toBeInTheDocument();
  });

  it("offers no range at all while the whole history fits inside the default week", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} {...defaults} />);
    expect(screen.queryAllByRole("radio")).toEqual([]);
  });

  it("offers a wider range only once a recorded day reaches past the narrower one", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} {...defaults}
      days={[{ date: "2026-08-21", answers: { drinking: 2 } },
             { date: "2026-08-10", answers: { drinking: 2 } }]} />);
    expect(screen.getByLabelText("14 ימים")).toBeInTheDocument();
    expect(screen.queryByLabelText("30 ימים")).not.toBeInTheDocument();
  });

  it("skips a range that would redraw the same rows but keeps a wider one that reaches further", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} {...defaults}
      days={[{ date: "2026-08-21", answers: { drinking: 2 } },
             { date: "2026-07-23", answers: { drinking: 2 } }]} />);
    expect(screen.queryByLabelText("14 ימים")).not.toBeInTheDocument();
    expect(screen.getByLabelText("30 ימים")).toBeInTheDocument();
  });

  it("falls back to the default week when the chosen range stops being offered", async () => {
    const { rerender } = render(
      <HistoryTable questionnaire={fixtureQuestionnaire} days={spread} {...defaults} />);
    await userEvent.click(screen.getByLabelText("30 ימים"));
    expect(rowDates()).toHaveLength(6);
    rerender(<HistoryTable questionnaire={fixtureQuestionnaire} {...defaults}
      days={[{ date: "2026-08-21", answers: { drinking: 2 } },
             { date: "2026-08-14", answers: { drinking: 2 } }]} />);
    expect(screen.queryByLabelText("30 ימים")).not.toBeInTheDocument();
    expect(rowDates()).toEqual(["ו׳ 21/08"]);
  });

  it("leaves the table empty when nothing was recorded inside the window", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} {...defaults} today="2026-09-30" />);
    expect(rowDates()).toEqual([]);
  });

  it("reddens an answer short of its question's warn floor, without the violation background", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire}
      days={[{ date: "2026-08-17", answers: { drinking: 3 } },
             { date: "2026-08-16", answers: { drinking: 4 } }]} {...defaults} />);
    const short = screen.getByText("3");
    expect(short).toHaveClass("shortfall");
    expect(short).not.toHaveClass("violation");
    expect(screen.getByText("4")).not.toHaveClass("shortfall");
  });

  it("bolds an answer off its question's norm, in either direction", () => {
    render(<HistoryTable questionnaire={fixtureQuestionnaire}
      days={[{ date: "2026-08-17", answers: { drinking: 3, window: 8 } },
             { date: "2026-08-16", answers: { drinking: 4 } }]} {...defaults} />);
    expect(screen.getByText("3")).not.toHaveClass("off-norm");
    expect(screen.getByText("4")).toHaveClass("off-norm");
    // The window question declares no norm, so its cells never bold.
    expect(screen.getByText("8")).not.toHaveClass("off-norm");
  });

  it("reddens a score reaching the day rule; the violation background never reaches the score column", () => {
    render(<HistoryTable questionnaire={trackerQuestionnaire}
      days={[{ date: "2026-08-16", answers: { carbs: 8, drinking: 3 } },
             { date: "2026-08-15", answers: { carbs: 7, drinking: 3 } }]} {...defaults} />);
    // Exactly the rule's bound: the score the nudge would count, so the day it lands is red.
    const high = screen.getByRole("button", { name: "הצגת היומן של 2026-08-16" });
    expect(high).toHaveClass("heavy-day");
    expect(high).not.toHaveClass("violation");
    const low = screen.getByRole("button", { name: "הצגת היומן של 2026-08-15" });
    expect(low).not.toHaveClass("heavy-day");
    expect(low).not.toHaveClass("violation");
  });
});
