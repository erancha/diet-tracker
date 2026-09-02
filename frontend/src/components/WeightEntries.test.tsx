import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeightEntries } from "./WeightEntries";

const ENTRIES = [
  { date: "2026-08-20", kg: 77.4, at: null },
  { date: "2026-08-27", kg: 76, at: null },
];

afterEach(() => vi.restoreAllMocks());

describe("WeightEntries", () => {
  it("lists the measurements newest first", () => {
    render(<WeightEntries entries={ENTRIES} target={null} onDelete={() => {}} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("76 ק״ג");
    expect(rows[1]).toHaveTextContent("77.4 ק״ג");
  });

  it("deletes only after the confirmation naming the entry is accepted", () => {
    const onDelete = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<WeightEntries entries={ENTRIES} target={null} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "מחיקת השקילה של 2026-08-20" }));

    expect(confirm).toHaveBeenCalledWith("למחוק את השקילה של 20/08 (77.4 ק״ג)?");
    expect(onDelete).toHaveBeenCalledWith("2026-08-20");
  });

  it("keeps the entry when the confirmation is declined", () => {
    const onDelete = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<WeightEntries entries={ENTRIES} target={null} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "מחיקת השקילה של 2026-08-27" }));

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("paints a value red only above the target, and heavier once it is far above", () => {
    render(<WeightEntries target={95} onDelete={() => {}}
                          entries={[
                            { date: "2026-08-13", kg: 94.8, at: null },
                            { date: "2026-08-20", kg: 96, at: null },
                            { date: "2026-08-27", kg: 105.4, at: null },
                          ]} />);
    const [far, over, under] = screen.getAllByRole("listitem");
    expect(far.querySelector(".over-target")).toHaveClass("far-over");
    expect(over.querySelector(".over-target")).not.toHaveClass("far-over");
    expect(under.querySelector(".over-target")).toBeNull();
  });

  it("reads values plainly before a target has been set", () => {
    render(<WeightEntries entries={ENTRIES} target={null} onDelete={() => {}} />);
    expect(document.querySelector(".over-target")).toBeNull();
  });

  it("shows the hour each weighing was taken at, which is what makes the rhythm legible", () => {
    render(<WeightEntries entries={[{ date: "2026-08-27", kg: 76, at: "07:30" }]}
                          target={null} onDelete={() => {}} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("07:30");
  });

  it("holds a dash where a weighing predates the recorded time, keeping the columns aligned", () => {
    render(<WeightEntries entries={[{ date: "2026-08-27", kg: 76, at: null }]}
                          target={null} onDelete={() => {}} />);
    expect(document.querySelector(".weight-entry-at")).toHaveTextContent("—");
  });

  it("renders nothing when no weight has been recorded", () => {
    const { container } = render(<WeightEntries entries={[]} target={null} onDelete={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
