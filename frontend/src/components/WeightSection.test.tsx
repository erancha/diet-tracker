import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeightSection } from "./WeightSection";
import type { WeightPayload, WeightSettings } from "../types";
import { DISCARD_EDITS_PROMPT } from "../edits";

const NOW = new Date(2026, 7, 27); // 2026-08-27
const TODAY = "2026-08-27";

const SETTINGS: WeightSettings = {
  weigh_in: { weekday: "THU", hour: 8 },
  chart_months: 3,
  limits: { min_kg: 20, max_kg: 400 },
};

const EMPTY: WeightPayload = { target: null, entries: [] };

interface Handlers {
  onRecord?: (kg: number) => void;
  onSetTarget?: (kg: number) => void;
  onDelete?: (date: string) => void;
}

function renderSection(weight: Partial<WeightPayload> = {}, handlers: Handlers = {},
                       defaultExpanded = false) {
  render(
    <WeightSection
      weight={{ ...EMPTY, ...weight }}
      settings={SETTINGS}
      now={NOW}
      onRecord={handlers.onRecord ?? (() => {})}
      onSetTarget={handlers.onSetTarget ?? (() => {})}
      onDelete={handlers.onDelete ?? (() => {})}
      defaultExpanded={defaultExpanded}
    />,
  );
}

// Renders the section and opens it, since folded is where it rests; the fold's own tests reach for
// renderSection instead.
function show(weight: Partial<WeightPayload> = {}, handlers: Handlers = {}) {
  renderSection(weight, handlers);
  fireEvent.click(screen.getByRole("button", { name: /^משקל/ }));
}

afterEach(() => vi.restoreAllMocks());

function line(): HTMLElement {
  return document.querySelector(".weight-summary")!;
}

describe("opening fold", () => {
  it("rests folded, so the day tracker below it keeps the top of the page", () => {
    renderSection();
    expect(screen.queryByLabelText("המשקל היום")).toBeNull();
  });

  it("opens itself when told to, so a first-time user meets the weighing and not a fold", () => {
    renderSection({}, {}, true);
    expect(screen.getByLabelText("המשקל היום")).toBeInTheDocument();
  });
});

describe("rhythm reading", () => {
  it("names the weigh-in day while the day holds no weighing", () => {
    show({ entries: [{ date: "2026-08-20", kg: 77, at: "07:30" }] });
    expect(document.querySelector(".weight-rhythm")).toHaveTextContent("היום יום השקילה");
  });

  it("drops away once the weigh-in day has been answered", () => {
    show({ entries: [{ date: TODAY, kg: 76.5, at: "07:30" }] });
    expect(document.querySelector(".weight-rhythm")).toBeNull();
  });

  it("says nothing before the first weighing, where there is no rhythm yet", () => {
    show();
    expect(document.querySelector(".weight-rhythm")).toBeNull();
  });
});

describe("target", () => {
  it("heads the section with the weight and reads the target beside it", () => {
    show({ target: 72, entries: [{ date: TODAY, kg: 76.5, at: null }] });
    // The weight is the toggle; the accessible name still says what the toggle opens.
    const toggle = screen.getByRole("button", { name: /^משקל/ });
    expect(toggle).toHaveTextContent("76.5 ק״ג");
    expect(toggle).toHaveAccessibleName("משקל: 76.5 ק״ג");
    // Beside it, only what follows the weight — the weight is not repeated.
    expect(line().textContent!.replace(/\s+/g, " ")).toContain("· 4.5 מעל היעד: 72 ק״ג");
    expect(line().textContent).not.toContain("76.5");
    expect(screen.getByRole("button", { name: "עריכת יעד" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("משקל יעד")).toBeNull();
    // The figures carry the accent; the units and the phrasing stay chrome.
    expect([...line().querySelectorAll(".value")].map((el) => el.textContent)).toEqual(["4.5", "72"]);
  });

  it("names itself when nothing has been weighed yet", () => {
    show();
    const toggle = screen.getByRole("button", { name: /^משקל/ });
    expect(toggle).toHaveTextContent("משקל");
    expect(toggle).toHaveAccessibleName("משקל");
  });

  it("marks the section over target, so the weight and the gap can be painted as one", () => {
    show({ target: 72, entries: [{ date: TODAY, kg: 76.5, at: null }] });
    expect(document.querySelector("section.weight")).toHaveClass("weight-over-target");
  });

  it("wraps the heading's figure alone, so the unit beside it is not painted with it", () => {
    show({ target: 72, entries: [{ date: TODAY, kg: 76.5, at: null }] });
    const figure = screen.getByRole("button", { name: /^משקל/ }).querySelector(".weight-latest");
    expect(figure).toHaveTextContent("76.5");
    expect(figure).not.toHaveTextContent("ק״ג");
  });

  it("leaves the mark off below the target", () => {
    show({ target: 80, entries: [{ date: TODAY, kg: 76.5, at: null }] });
    expect(document.querySelector("section.weight")).not.toHaveClass("weight-over-target");
  });

  it("leaves the mark off before there is a target to read against", () => {
    show({ entries: [{ date: TODAY, kg: 76.5, at: null }] });
    expect(document.querySelector("section.weight")).not.toHaveClass("weight-over-target");
  });

  it("opens its editor while no target stands, so it is not a word to walk past", () => {
    show({ entries: [{ date: TODAY, kg: 76.5, at: null }] });
    expect(screen.getByLabelText("משקל יעד")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "עריכת יעד" })).toHaveAttribute("aria-expanded", "true");
  });

  it("says so plainly once that editor is closed", () => {
    show({ entries: [{ date: TODAY, kg: 76.5, at: null }] });
    fireEvent.click(screen.getByRole("button", { name: "עריכת יעד" }));
    expect(line().textContent!.replace(/\s+/g, " ")).toContain("היעד: טרם נקבע");
  });

  it("keeps a standing target's editor closed", () => {
    show({ target: 75 });
    expect(screen.queryByLabelText("משקל יעד")).toBeNull();
  });

  it("asks to set, not to update, a target that never stood", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSetTarget = vi.fn();
    show({}, { onSetTarget });

    fireEvent.change(screen.getByLabelText("משקל יעד"), { target: { value: "72" } });
    fireEvent.click(screen.getByRole("button", { name: "אישור" }));

    expect(confirm).toHaveBeenCalledWith("לקבוע את משקל היעד ל-72 ק״ג?");
    expect(onSetTarget).toHaveBeenCalledWith(72);
  });

  it("offers the target before anything has been weighed", () => {
    show();
    expect(screen.getByRole("button", { name: "עריכת יעד" })).toBeInTheDocument();
  });

  it("stays reachable once the section is folded away", () => {
    show({ target: 72, entries: [{ date: TODAY, kg: 76.5, at: null }] });
    fireEvent.click(screen.getByRole("button", { name: /^משקל/ }));
    expect(screen.getByRole("button", { name: /^משקל/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "עריכת יעד" })).toBeInTheDocument();
  });

  it("commits an edited target only after the confirmation is accepted", () => {
    const onSetTarget = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    show({ target: 75 }, { onSetTarget });

    fireEvent.click(screen.getByRole("button", { name: "עריכת יעד" }));
    fireEvent.change(screen.getByLabelText("משקל יעד"), { target: { value: "72" } });
    fireEvent.click(screen.getByRole("button", { name: "אישור" }));

    expect(confirm).toHaveBeenCalledWith("לעדכן את משקל היעד ל-72 ק״ג?");
    expect(onSetTarget).toHaveBeenCalledWith(72);
  });

  it("keeps the standing target when the confirmation is declined", () => {
    const onSetTarget = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    show({ target: 75 }, { onSetTarget });

    fireEvent.click(screen.getByRole("button", { name: "עריכת יעד" }));
    fireEvent.change(screen.getByLabelText("משקל יעד"), { target: { value: "72" } });
    fireEvent.click(screen.getByRole("button", { name: "אישור" }));

    expect(onSetTarget).not.toHaveBeenCalled();
    expect(screen.getByLabelText("משקל יעד")).toHaveValue(72);
  });

  it("closes an untouched input on a second click, without asking", () => {
    const confirm = vi.spyOn(window, "confirm");
    show({ target: 75 });
    const toggle = screen.getByRole("button", { name: "עריכת יעד" });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);

    expect(confirm).not.toHaveBeenCalled();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(line().textContent!.replace(/\s+/g, " ")).toContain("היעד: 75 ק״ג");
  });

  it("asks before closing on a value that was actually typed", () => {
    const onSetTarget = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    show({ target: 75 }, { onSetTarget });
    const toggle = screen.getByRole("button", { name: "עריכת יעד" });

    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText("משקל יעד"), { target: { value: "72" } });
    fireEvent.click(toggle);

    expect(confirm).toHaveBeenCalledWith(DISCARD_EDITS_PROMPT);
    expect(onSetTarget).not.toHaveBeenCalled();
    expect(screen.getByLabelText("משקל יעד")).toHaveValue(72);
  });

  it("blocks a target outside the range the API accepts", () => {
    show({ target: 75 });
    fireEvent.click(screen.getByRole("button", { name: "עריכת יעד" }));
    fireEvent.change(screen.getByLabelText("משקל יעד"), { target: { value: "7.5" } });
    expect(screen.getByRole("button", { name: "אישור" })).toBeDisabled();
  });
});

describe("today's weighing", () => {
  it("records a weight and clears the input", () => {
    const onRecord = vi.fn();
    show({}, { onRecord });

    const input = screen.getByLabelText("המשקל היום");
    fireEvent.change(input, { target: { value: "76.5" } });
    fireEvent.click(screen.getByRole("button", { name: "שמירה" }));

    expect(onRecord).toHaveBeenCalledWith(76.5);
    expect(input).toHaveValue(null);
  });

  it("offers an update, and shows the standing value, once the day holds one", () => {
    show({ entries: [{ date: TODAY, kg: 76.5, at: null }] });
    expect(screen.getByRole("button", { name: "עדכון" })).toBeInTheDocument();
    expect(screen.getByText("נרשם: 76.5 ק״ג")).toBeInTheDocument();
  });

  it("cannot submit an empty or out-of-range input", () => {
    show();
    expect(screen.getByRole("button", { name: "שמירה" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("המשקל היום"), { target: { value: "765" } });
    expect(screen.getByRole("button", { name: "שמירה" })).toBeDisabled();
  });
});

describe("summary line", () => {
  it("keeps the whole reading on screen through the fold", () => {
    show({ target: 72, entries: [{ date: TODAY, kg: 76.5, at: null }] });
    const toggle = screen.getByRole("button", { name: /^משקל/ });
    const reading = () => `${toggle.textContent} ${line().textContent}`.replace(/\s+/g, " ");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(reading()).toContain("76.5 ק״ג · 4.5 מעל היעד: 72 ק״ג");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(reading()).toContain("76.5 ק״ג · 4.5 מעל היעד: 72 ק״ג");
  });
});
