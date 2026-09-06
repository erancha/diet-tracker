import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Welcome } from "./Welcome";

describe("Welcome", () => {
  it("opens on a greeting and lists the three steps that start the tracking", () => {
    render(<Welcome autoFold={false} />);

    expect(screen.getByRole("heading", { name: /ברוכים הבאים/ })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("folds the steps behind the greeting, leaving the heading in place", () => {
    render(<Welcome autoFold={false} />);
    const toggle = screen.getByRole("button", { name: /ברוכים הבאים/ });

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: /ברוכים הבאים/ })).toBeInTheDocument();
  });

  it("tucks the steps away when the intro ends", () => {
    const { rerender } = render(<Welcome autoFold={false} />);
    rerender(<Welcome autoFold />);

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("leaves a fold a hand toggle already claimed alone", () => {
    const { rerender } = render(<Welcome autoFold={false} />);
    const toggle = screen.getByRole("button", { name: /ברוכים הבאים/ });
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    rerender(<Welcome autoFold />);

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
