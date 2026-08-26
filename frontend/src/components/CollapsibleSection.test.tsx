import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CollapsibleSection } from "./CollapsibleSection";

describe("CollapsibleSection", () => {
  it("renders expanded by default and folds the body on toggle", () => {
    render(
      <CollapsibleSection title="כותרת">
        <p>גוף</p>
      </CollapsibleSection>,
    );
    const toggle = screen.getByRole("button", { name: "כותרת" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("גוף")).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("גוף")).toBeNull();
  });

  it("starts collapsed when asked, keeping the summary visible", () => {
    render(
      <CollapsibleSection title="כותרת" defaultCollapsed summary={<span>תקציר</span>}>
        <p>גוף</p>
      </CollapsibleSection>,
    );
    expect(screen.getByRole("button", { name: "כותרת" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("תקציר")).toBeInTheDocument();
    expect(screen.queryByText("גוף")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "כותרת" }));
    expect(screen.getByText("גוף")).toBeInTheDocument();
  });

  it("seats a header aside on the title's own row", () => {
    render(
      <CollapsibleSection title="כותרת" headerAside={<span>נלווה</span>}>
        <p>גוף</p>
      </CollapsibleSection>,
    );
    const row = screen.getByRole("heading", { name: "כותרת" }).parentElement!;
    expect(row).toHaveClass("section-header");
    expect(row).toContainElement(screen.getByText("נלווה"));
  });
});
