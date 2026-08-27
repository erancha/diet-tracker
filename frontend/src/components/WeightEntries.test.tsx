import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeightEntries } from "./WeightEntries";

const ENTRIES = [
  { date: "2026-08-20", kg: 77.4 },
  { date: "2026-08-27", kg: 76 },
];

afterEach(() => vi.restoreAllMocks());

describe("WeightEntries", () => {
  it("lists the measurements newest first", () => {
    render(<WeightEntries entries={ENTRIES} onDelete={() => {}} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("76 ק״ג");
    expect(rows[1]).toHaveTextContent("77.4 ק״ג");
  });

  it("deletes only after the confirmation naming the entry is accepted", () => {
    const onDelete = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<WeightEntries entries={ENTRIES} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "מחיקת השקילה של 2026-08-20" }));

    expect(confirm).toHaveBeenCalledWith("למחוק את השקילה של 20/08 (77.4 ק״ג)?");
    expect(onDelete).toHaveBeenCalledWith("2026-08-20");
  });

  it("keeps the entry when the confirmation is declined", () => {
    const onDelete = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<WeightEntries entries={ENTRIES} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "מחיקת השקילה של 2026-08-27" }));

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("renders nothing when no weight has been recorded", () => {
    const { container } = render(<WeightEntries entries={[]} onDelete={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
