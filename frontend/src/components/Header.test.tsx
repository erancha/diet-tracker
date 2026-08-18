import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "./Header";

describe("Header", () => {
  it("invokes onSignOut when the sign-out button is clicked", async () => {
    const onSignOut = vi.fn();
    render(<Header email="a@b.com" onSignOut={onSignOut} />);

    await userEvent.click(screen.getByRole("button", { name: "התנתקות" }));

    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
