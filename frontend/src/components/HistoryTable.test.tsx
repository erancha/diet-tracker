import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryTable } from "./HistoryTable";
import { fixtureQuestionnaire, trackerQuestionnaire } from "../test-fixtures";
import type { Questionnaire } from "../types";

// The table carries only the questions that chart no trend panel, and both of the shared
// fixture's questions chart. Dropping their panel headings is what puts them in the table, which
// is where the cases below read them.
const tabulated: Questionnaire = {
  ...fixtureQuestionnaire,
  questions: fixtureQuestionnaire.questions.map(
    ({ panel_title: _panel, ...question }) => question),
};

const days = [
  { date: "2026-08-17", answers: { drinking: 2 }, excluded: 0 },
];

// Every date used below falls inside the default 7-day window ending on this day, so only the
// range tests have to think about the window.
const defaults = {
  today: "2026-08-21", treatDay: { weekday: "FRI" },
  deletableDates: new Set<string>(), viewedDate: null, onDelete: () => {}, onView: () => {},
};
// A row offers deletion only where both conditions hold: the date is still deletable and its day
// view is the open one.
const deleting = { deletableDates: new Set(["2026-08-17"]), viewedDate: "2026-08-17" };

// The row a cell sits in — where a day's score crossing is now reported.
const rowOf = (cell: HTMLElement) => cell.closest("tr")!;

describe("HistoryTable", () => {
  it("shows the row date as weekday and DD/MM without the year", () => {
    render(<HistoryTable questionnaire={tabulated} days={days} {...defaults} />);
    expect(screen.getByText("ב׳ 17/08")).toBeInTheDocument();
    expect(screen.queryByText("2026-08-17")).not.toBeInTheDocument();
  });

  // An open-ended bound is not a quantity, so it keeps its wording where other answers reduce to
  // their number — "2" under a ליטר header would claim two litres were drunk.
  it("marks a violating open-ended answer with its choice label", () => {
    render(<HistoryTable questionnaire={tabulated} days={days} {...defaults} />);
    expect(screen.getByText("פחות מ-2.5 ליטר !!")).toHaveClass("violation");
  });

  // A bound label is a sentence, not a quantity. Its cell is marked so the stylesheet can
  // truncate it to the row's single-line height, with the full wording kept in the cell's title.
  it("marks a bound-label cell for truncation, carrying the full wording in its title", () => {
    const measured = [{ date: "2026-08-17", answers: { drinking: 2, window: 8 }, excluded: 0 }];
    render(<HistoryTable questionnaire={tabulated} days={measured} {...defaults} />);
    const cell = screen.getByText("פחות מ-2.5 ליטר !!");
    expect(cell).toHaveClass("bound");
    expect(cell).toHaveAttribute("title", "פחות מ-2.5 ליטר !!");
    expect(screen.getByText("8")).not.toHaveClass("bound");
    expect(screen.getByText("8")).not.toHaveAttribute("title");
  });

  it("names the unit once in the column header, not in every cell under it", () => {
    const measured = [{ date: "2026-08-17", answers: { drinking: 3, window: 8 }, excluded: 0 }];
    render(<HistoryTable questionnaire={tabulated} days={measured} {...defaults} />);
    expect(screen.getByText("חלון אכילה (שעות)")).toBeInTheDocument();
    expect(screen.getByText("שתיה (ליטר)")).toBeInTheDocument();
    // Both answers read as the quantity alone; their choice labels would repeat the header.
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("8 שעות")).toBeNull();
    expect(screen.queryByText("3 ליטר")).toBeNull();
  });

  it("exposes a question's tooltip on its column header", () => {
    render(<HistoryTable questionnaire={tabulated} days={days} {...defaults} />);
    expect(screen.getByText("חלון אכילה (שעות)"))
      .toHaveAttribute("title", "מהארוחה הראשונה עד האחרונה");
  });

  it("renders a dash for questions without an answer", () => {
    render(<HistoryTable questionnaire={tabulated} days={days} {...defaults} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("deletes only after the user confirms a dialog naming the row's date", async () => {
    const onDelete = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<HistoryTable questionnaire={tabulated} days={days}
      {...defaults} {...deleting} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "מחיקת הרשומה של 2026-08-17" }));
    expect(confirmSpy).toHaveBeenCalledWith("למחוק את הרשומה של 2026-08-17?");
    expect(onDelete).toHaveBeenCalledWith("2026-08-17");
  });

  it("does not delete when the user dismisses the confirm dialog", async () => {
    const onDelete = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<HistoryTable questionnaire={tabulated} days={days}
      {...defaults} {...deleting} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "מחיקת הרשומה של 2026-08-17" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("puts the delete button in the row's last cell, clear of the date", () => {
    render(<HistoryTable questionnaire={tabulated} days={days}
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
      days={[{ date: "2026-08-17", answers: { carbs: 4, drinking: 3 }, excluded: 0 }]}
      {...defaults} {...deleting} onDelete={onDelete} onView={onView} />);
    await userEvent.click(screen.getByRole("button", { name: "מחיקת הרשומה של 2026-08-17" }));
    expect(onDelete).toHaveBeenCalledWith("2026-08-17");
    expect(onView).not.toHaveBeenCalled();
  });

  it("omits the delete button for dates outside the deletable window", () => {
    render(<HistoryTable questionnaire={tabulated} days={days}
      {...defaults} viewedDate="2026-08-17" />);
    expect(screen.queryByRole("button", { name: /מחיקת/ })).not.toBeInTheDocument();
  });

  it("withholds the delete button until the row's own day view is open", () => {
    const { rerender } = render(<HistoryTable questionnaire={tabulated} days={days}
      {...defaults} deletableDates={deleting.deletableDates} />);
    expect(screen.queryByRole("button", { name: /מחיקת/ })).not.toBeInTheDocument();
    rerender(<HistoryTable questionnaire={tabulated} days={days} {...defaults} {...deleting} />);
    expect(screen.getByRole("button", { name: "מחיקת הרשומה של 2026-08-17" })).toBeInTheDocument();
  });

  it("makes the whole score summary cell the view control for a past day", async () => {
    const onView = vi.fn();
    render(<HistoryTable questionnaire={trackerQuestionnaire}
      days={[{ date: "2026-08-17", answers: { carbs: 4, drinking: 3 }, excluded: 0 }]}
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
      days={[{ date: "2026-08-21", answers: { carbs: 4, drinking: 3 }, excluded: 0 }]} {...defaults} onView={onView} />);
    await userEvent.click(screen.getByRole("button", { name: "הצגת היומן של 2026-08-21" }));
    expect(onView).toHaveBeenCalledWith("2026-08-21");
  });

  // Spans 30 days back from 2026-08-21: the window edges are 15/08 (7 days), 08/08 (14) and
  // 23/07 (30), and 22/07 lies outside every range the picker offers.
  const spread = ["2026-08-21", "2026-08-15", "2026-08-14", "2026-08-08", "2026-08-07",
                  "2026-07-23", "2026-07-22"].map((date) => ({ date, answers: { drinking: 2 }, excluded: 0 }));
  const rowDates = () => screen.getAllByRole("row").slice(1).map((row) => row.firstElementChild!.textContent);

  it("shows only the last 7 days until the reader asks for more", () => {
    render(<HistoryTable questionnaire={tabulated} days={spread} {...defaults} />);
    expect(rowDates()).toEqual(["ו׳ 21/08", "ש׳ 15/08"]);
  });

  it("reaches back 14 days, then 30, as the reader widens the range", async () => {
    render(<HistoryTable questionnaire={tabulated} days={spread} {...defaults} />);
    await userEvent.click(screen.getByLabelText("14 ימים"));
    expect(rowDates()).toEqual(["ו׳ 21/08", "ש׳ 15/08", "ו׳ 14/08", "ש׳ 08/08"]);
    await userEvent.click(screen.getByLabelText("30 ימים"));
    expect(rowDates()).toEqual(["ו׳ 21/08", "ש׳ 15/08", "ו׳ 14/08", "ש׳ 08/08", "ו׳ 07/08", "ה׳ 23/07"]);
  });

  it("never shows a day older than the widest range offered", async () => {
    render(<HistoryTable questionnaire={tabulated} days={spread} {...defaults} />);
    await userEvent.click(screen.getByLabelText("30 ימים"));
    expect(screen.queryByText("ד׳ 22/07")).not.toBeInTheDocument();
  });

  it("offers no range at all while the whole history fits inside the default week", () => {
    render(<HistoryTable questionnaire={tabulated} days={days} {...defaults} />);
    expect(screen.queryAllByRole("radio")).toEqual([]);
  });

  it("offers a wider range only once a recorded day reaches past the narrower one", () => {
    render(<HistoryTable questionnaire={tabulated} {...defaults}
      days={[{ date: "2026-08-21", answers: { drinking: 2 }, excluded: 0 },
             { date: "2026-08-10", answers: { drinking: 2 }, excluded: 0 }]} />);
    expect(screen.getByLabelText("14 ימים")).toBeInTheDocument();
    expect(screen.queryByLabelText("30 ימים")).not.toBeInTheDocument();
  });

  it("skips a range that would redraw the same rows but keeps a wider one that reaches further", () => {
    render(<HistoryTable questionnaire={tabulated} {...defaults}
      days={[{ date: "2026-08-21", answers: { drinking: 2 }, excluded: 0 },
             { date: "2026-07-23", answers: { drinking: 2 }, excluded: 0 }]} />);
    expect(screen.queryByLabelText("14 ימים")).not.toBeInTheDocument();
    expect(screen.getByLabelText("30 ימים")).toBeInTheDocument();
  });

  it("falls back to the default week when the chosen range stops being offered", async () => {
    const { rerender } = render(
      <HistoryTable questionnaire={tabulated} days={spread} {...defaults} />);
    await userEvent.click(screen.getByLabelText("30 ימים"));
    expect(rowDates()).toHaveLength(6);
    rerender(<HistoryTable questionnaire={tabulated} {...defaults}
      days={[{ date: "2026-08-21", answers: { drinking: 2 }, excluded: 0 },
             { date: "2026-08-14", answers: { drinking: 2 }, excluded: 0 }]} />);
    expect(screen.queryByLabelText("30 ימים")).not.toBeInTheDocument();
    expect(rowDates()).toEqual(["ו׳ 21/08"]);
  });

  it("leaves the table empty when nothing was recorded inside the window", () => {
    render(<HistoryTable questionnaire={tabulated} days={days} {...defaults} today="2026-09-30" />);
    expect(rowDates()).toEqual([]);
  });

  it("reddens an answer short of its question's warn floor, without the violation background", () => {
    render(<HistoryTable questionnaire={tabulated}
      days={[{ date: "2026-08-17", answers: { drinking: 3 }, excluded: 0 },
             { date: "2026-08-16", answers: { drinking: 4 }, excluded: 0 }]} {...defaults} />);
    const short = screen.getByText("3");
    expect(short).toHaveClass("shortfall");
    expect(short).not.toHaveClass("violation");
    expect(screen.getByText("4")).not.toHaveClass("shortfall");
  });

  it("bolds an answer off its question's norm, in either direction", () => {
    render(<HistoryTable questionnaire={tabulated}
      days={[{ date: "2026-08-17", answers: { drinking: 3, window: 8 }, excluded: 0 },
             { date: "2026-08-16", answers: { drinking: 4 }, excluded: 0 }]} {...defaults} />);
    expect(screen.getByText("3")).not.toHaveClass("off-norm");
    expect(screen.getByText("4")).toHaveClass("off-norm");
    // The window question declares no norm, so its cells never bold.
    expect(screen.getByText("8")).not.toHaveClass("off-norm");
  });

  it("leaves a charting question to its trend panel, tabulating only the rest", () => {
    // Both of the shared fixture's questions carry a panel heading, so neither reaches the table.
    render(<HistoryTable questionnaire={fixtureQuestionnaire} days={days} {...defaults} />);
    expect(screen.queryByRole("columnheader", { name: /שתיה/ })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: /חלון אכילה/ })).toBeNull();
    // The tracker questionnaire's drinking charts nothing, so its column stays.
    render(<HistoryTable questionnaire={trackerQuestionnaire} days={days} {...defaults} />);
    expect(screen.getByRole("columnheader", { name: /שתיה/ })).toBeInTheDocument();
  });

  it("reports the excluded subtotal in its own column, right before the score", () => {
    render(<HistoryTable questionnaire={trackerQuestionnaire}
      days={[{ date: "2026-08-17", answers: { carbs: 21, drinking: 3 }, excluded: 13 }]}
      {...defaults} />);
    expect(screen.getByRole("columnheader", { name: "ציון קמחים וסוכרים" })).toBeInTheDocument();
    const score = screen.getByRole("button", { name: "הצגת היומן של 2026-08-17" });
    expect(score.previousElementSibling).toHaveTextContent("13");
  });

  it("rounds the excluded subtotal as the score beside it is rounded", () => {
    render(<HistoryTable questionnaire={trackerQuestionnaire}
      days={[{ date: "2026-08-17", answers: { carbs: 21, drinking: 3 }, excluded: 10.5 }]}
      {...defaults} />);
    const score = screen.getByRole("button", { name: "הצגת היומן של 2026-08-17" });
    expect(score.previousElementSibling).toHaveTextContent("11");
  });

  it("grounds the whole row of a score reaching the day rule, marking no cell of it", () => {
    render(<HistoryTable questionnaire={trackerQuestionnaire}
      days={[{ date: "2026-08-16", answers: { carbs: 8, drinking: 3 }, excluded: 0 },
             { date: "2026-08-15", answers: { carbs: 7, drinking: 3 }, excluded: 0 }]} {...defaults} />);
    // Exactly the rule's bound: the score the nudge would count, so the day it lands is heavy.
    const high = screen.getByRole("button", { name: "הצגת היומן של 2026-08-16" });
    expect(rowOf(high)).toHaveClass("heavy-row");
    expect(high).not.toHaveClass("heavy-day");
    expect(high).not.toHaveClass("violation");
    const low = screen.getByRole("button", { name: "הצגת היומן של 2026-08-15" });
    expect(rowOf(low)).not.toHaveClass("heavy-row");
    expect(low).not.toHaveClass("violation");
  });

  it("judges the treat day like any other, softening its heavy row", () => {
    // 2026-08-21 is the Friday the treat day is set to; the 20th is an ordinary Thursday.
    render(<HistoryTable questionnaire={trackerQuestionnaire}
      days={[{ date: "2026-08-21", answers: { carbs: 8, drinking: 3 }, excluded: 0 },
             { date: "2026-08-20", answers: { carbs: 8, drinking: 3 }, excluded: 0 }]} {...defaults} />);
    const treat = rowOf(screen.getByRole("button", { name: "הצגת היומן של 2026-08-21" }));
    expect(treat).toHaveClass("heavy-row");
    expect(treat).toHaveClass("treat-day");
    const ordinary = rowOf(screen.getByRole("button", { name: "הצגת היומן של 2026-08-20" }));
    expect(ordinary).toHaveClass("heavy-row");
    expect(ordinary).not.toHaveClass("treat-day");
  });

  it("softens a treat-day answer's violation mark without dropping it", () => {
    render(<HistoryTable questionnaire={tabulated}
      days={[{ date: "2026-08-21", answers: { drinking: 2 }, excluded: 0 }]} {...defaults} />);
    const cell = screen.getByText("פחות מ-2.5 ליטר !!");
    expect(cell).toHaveClass("violation");
    expect(cell).toHaveClass("treat-day");
  });

  it("leaves a treat day inside every bound unmarked", () => {
    render(<HistoryTable questionnaire={trackerQuestionnaire}
      days={[{ date: "2026-08-21", answers: { carbs: 5, drinking: 3 }, excluded: 0 }]} {...defaults} />);
    const row = rowOf(screen.getByRole("button", { name: "הצגת היומן של 2026-08-21" }));
    expect(row).not.toHaveClass("heavy-row");
    expect(row).not.toHaveClass("treat-day");
  });
});
