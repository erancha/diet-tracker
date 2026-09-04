import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "./Header";

const props = { email: "a@b.com", muted: false, onSignOut: vi.fn(), onSetMuted: vi.fn(),
                activeViolations: [] as string[] };

async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: "תפריט חשבון" }));
}

describe("Header", () => {
  it("titles the signed-in app with the same name the landing page shows", () => {
    render(<Header {...props} />);

    expect(screen.getByRole("heading", { name: "מעקב תזונה" })).toBeInTheDocument();
  });

  it("names the signed-in address in the menu rather than on the page behind it", async () => {
    render(<Header {...props} />);

    expect(screen.queryByText("a@b.com")).toBeNull();

    await openMenu();
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
  });

  it("keeps sign-out as the account menu's last item", async () => {
    const onSignOut = vi.fn();
    render(<Header {...props} onSignOut={onSignOut} />);

    await openMenu();
    const items = screen.getAllByRole("menuitem");
    const signOut = items[items.length - 1];
    expect(signOut).toHaveTextContent("התנתקות");

    await userEvent.click(signOut);
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("offers a subscribed account the way out of the reminders", async () => {
    const onSetMuted = vi.fn();
    render(<Header {...props} onSetMuted={onSetMuted} />);

    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "ביטול התראות" }));

    expect(onSetMuted).toHaveBeenCalledWith(true);
  });

  it("offers an unsubscribed account the way back rather than the same exit again", async () => {
    const onSetMuted = vi.fn();
    render(<Header {...props} muted onSetMuted={onSetMuted} />);

    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "ביטול התראות" })).toBeNull();

    await userEvent.click(screen.getByRole("menuitem", { name: "חידוש התראות" }));

    expect(onSetMuted).toHaveBeenCalledWith(false);
  });

  it("keeps the menu closed until the account button is pressed", () => {
    render(<Header {...props} />);

    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("swaps the trigger glyph from the menu bars to a close mark while the menu is open", async () => {
    render(<Header {...props} />);

    const trigger = screen.getByRole("button", { name: "תפריט חשבון" });
    expect(trigger.querySelector("path")).toHaveAttribute("d", "M3 6h18");

    await openMenu();

    expect(trigger.querySelector("path")).toHaveAttribute("d", "M18 6 6 18");
  });

  it("marks the trigger expanded while its menu is open, which is what the open state paints from",
     async () => {
    render(<Header {...props} />);

    const trigger = screen.getByRole("button", { name: "תפריט חשבון" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("dismisses the floating menu on Escape and on a press outside it", async () => {
    render(<Header {...props} />);

    await openMenu();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menuitem")).toBeNull();

    await openMenu();
    await userEvent.click(document.body);
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("shows no alarm when there are no active violations", () => {
    render(<Header {...props} />);

    expect(screen.queryByRole("button", { name: "חריגות פעילות" })).toBeNull();
  });

  it("badges the alarm with the violation count and toggles the messages open and closed", async () => {
    const messages = ["ציון פחמימות 11 ומעלה 3 ימים ברצף", "פחות מ-2.5 ליטר שתיה 2 ימים ברצף"];
    render(<Header {...props} activeViolations={messages} />);

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
