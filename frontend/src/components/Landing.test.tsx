import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Landing } from "./Landing";

describe("Landing", () => {
  it("summarizes the app's functionality under the app title", () => {
    render(<Landing onSignIn={() => {}} />);

    expect(screen.getByRole("heading", { name: "מעקב תזונה" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("links to the source repository", () => {
    render(<Landing onSignIn={() => {}} />);

    expect(screen.getByRole("link", { name: "קוד המקור ב-GitHub" })).toHaveAttribute(
      "href", "https://github.com/erancha/diet-tracker",
    );
  });

  it("invokes onSignIn when the sign-in button is clicked", async () => {
    const onSignIn = vi.fn();
    render(<Landing onSignIn={onSignIn} />);

    await userEvent.click(screen.getByRole("button", { name: "התחברות עם Google" }));

    expect(onSignIn).toHaveBeenCalledOnce();
  });
});
