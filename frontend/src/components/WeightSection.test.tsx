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

function show(weight: Partial<WeightPayload> = {}, handlers: {
  onRecord?: (kg: number) => void;
  onSetTarget?: (kg: number) => void;
  onDelete?: (date: string) => void;
} = {}) {
  render(
    <WeightSection
      weight={{ ...EMPTY, ...weight }}
      settings={SETTINGS}
      now={NOW}
      onRecord={handlers.onRecord ?? (() => {})}
      onSetTarget={handlers.onSetTarget ?? (() => {})}
      onDelete={handlers.onDelete ?? (() => {})}
    />,
  );
  // The section rests folded; every test below acts on what its toggle opens.
  fireEvent.click(screen.getByRole("button", { name: /^משקל/ }));
}

afterEach(() => vi.restoreAllMocks());

function line(): HTMLElement {
  return document.querySelector(".weight-summary")!;
}

describe("target", () => {
  it("heads the section with the weight and reads the target beside it", () => {
    show({ target: 72, entries: [{ date: TODAY, kg: 76.5 }] });
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

  it("says so plainly before a target exists", () => {
    show({ entries: [{ date: TODAY, kg: 76.5 }] });
    expect(line().textContent!.replace(/\s+/g, " ")).toContain("היעד: טרם נקבע");
  });

  it("offers the target before anything has been weighed", () => {
    show();
    expect(screen.getByRole("button", { name: "עריכת יעד" })).toBeInTheDocument();
  });

  it("stays reachable once the section is folded away", () => {
    show({ target: 72, entries: [{ date: TODAY, kg: 76.5 }] });
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
    show({ entries: [{ date: TODAY, kg: 76.5 }] });
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
    show({ target: 72, entries: [{ date: TODAY, kg: 76.5 }] });
    const toggle = screen.getByRole("button", { name: /^משקל/ });
    const reading = () => `${toggle.textContent} ${line().textContent}`.replace(/\s+/g, " ");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(reading()).toContain("76.5 ק״ג · 4.5 מעל היעד: 72 ק״ג");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(reading()).toContain("76.5 ק״ג · 4.5 מעל היעד: 72 ק״ג");
  });
});
