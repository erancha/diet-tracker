import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "./Header";

describe("Header", () => {
  it("invokes onSignOut when the sign-out button is clicked", async () => {
    const onSignOut = vi.fn();
    render(<Header email="a@b.com" onSignOut={onSignOut} activeViolations={[]} />);

    await userEvent.click(screen.getByRole("button", { name: "התנתקות" }));

    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("shows no alarm when there are no active violations", () => {
    render(<Header email="a@b.com" onSignOut={vi.fn()} activeViolations={[]} />);

    expect(screen.queryByRole("button", { name: "חריגות פעילות" })).toBeNull();
  });

  it("badges the alarm with the violation count and toggles the messages open and closed", async () => {
    const messages = ["ציון פחמימות 11 ומעלה 3 ימים ברצוף", "פחות מ-2.5 ליטר שתיה 2 ימים ברצוף"];
    render(<Header email="a@b.com" onSignOut={vi.fn()} activeViolations={messages} />);

    const alarm = screen.getByRole("button", { name: "חריגות פעילות" });
    expect(alarm.textContent).toContain("2");
    expect(screen.queryByText(messages[0])).toBeNull();

    await userEvent.click(alarm);
    expect(screen.getByText(messages[0])).toBeInTheDocument();
    expect(screen.getByText(messages[1])).toBeInTheDocument();

    await userEvent.click(alarm);
    expect(screen.queryByText(messages[0])).toBeNull();
  });
});
