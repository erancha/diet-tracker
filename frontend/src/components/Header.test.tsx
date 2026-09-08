import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "./Header";
import type { UndeliveredMessage } from "../types";
import { instantLabel } from "../dates";

const props = { email: "a@b.com", muted: false, isAdmin: false, onSignOut: vi.fn(),
                onSetMuted: vi.fn(), onFoldAll: vi.fn(), nextViewCondensed: true,
                activeViolations: [] as string[],
                undelivered: [] as UndeliveredMessage[],
                onDismissUndelivered: vi.fn() };

const UNDELIVERED: UndeliveredMessage = {
  at: "2026-09-01T17:00:00+00:00",
  subject: "תזכורת — רישום ארוחות",
  body: "עדיין לא רשמת ארוחות היום",
  html: '<div dir="rtl">עדיין לא רשמת ארוחות היום</div>',
};

async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: "תפריט חשבון" }));
}

describe("Header", () => {
  it("titles the signed-in app with the same name the landing page shows", () => {
    render(<Header {...props} />);

    expect(screen.getByRole("heading", { name: "מעקב תזונה AI" })).toBeInTheDocument();
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

  it("offers the view toggle from the account menu, named for the view it will switch to", async () => {
    const onFoldAll = vi.fn();
    render(<Header {...props} onFoldAll={onFoldAll} nextViewCondensed />);

    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "תצוגה מלאה" })).toBeNull();
    await userEvent.click(screen.getByRole("menuitem", { name: "תצוגה מצומצמת" }));

    expect(onFoldAll).toHaveBeenCalledOnce();
    // The action fires with the menu already dismissed, like every other item.
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("offers the way back to the full view while the condensed one stands", async () => {
    render(<Header {...props} nextViewCondensed={false} />);

    await openMenu();
    expect(screen.getByRole("menuitem", { name: "תצוגה מלאה" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "תצוגה מצומצמת" })).toBeNull();
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

  it("offers a WhatsApp invite from the menu, opening in a new tab off the page", async () => {
    render(<Header {...props} />);

    await openMenu();
    const invite = screen.getByRole("menuitem", { name: "הזמנת חברים ב-WhatsApp" });
    expect(invite).toHaveAttribute("target", "_blank");
    expect(invite.getAttribute("href")).toContain("https://wa.me/?text=");
    expect(invite.getAttribute("href")).toContain(encodeURIComponent("קיבלתי המלצה"));
  });

  it("lets the admin's invite speak as the app's developer", async () => {
    render(<Header {...props} isAdmin />);

    await openMenu();
    const invite = screen.getByRole("menuitem", { name: "הזמנת חברים ב-WhatsApp" });
    expect(invite.getAttribute("href")).toContain(encodeURIComponent("פיתחתי"));
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

  it("shows no alarm when nothing is waiting", () => {
    render(<Header {...props} />);

    expect(screen.queryByRole("button", { name: "התראות ממתינות" })).toBeNull();
  });

  it("badges the alarm with the violation count and toggles the messages open and closed", async () => {
    const messages = ["ציון פחמימות 11 ומעלה 3 ימים ברצף", "פחות מ-2.5 ליטר שתיה 2 ימים ברצף"];
    render(<Header {...props} activeViolations={messages} />);

    const alarm = screen.getByRole("button", { name: "התראות ממתינות" });
    expect(alarm.textContent).toContain("2");
    expect(screen.queryByText(messages[0])).toBeNull();

    await userEvent.click(alarm);
    expect(screen.getByText(messages[0])).toBeInTheDocument();
    expect(screen.getByText(messages[1])).toBeInTheDocument();

    await userEvent.click(alarm);
    expect(screen.queryByText(messages[0])).toBeNull();
  });

  it("raises the alarm for an undelivered message even on a clean record", async () => {
    render(<Header {...props} undelivered={[UNDELIVERED]} />);

    const alarm = screen.getByRole("button", { name: "התראות ממתינות" });
    expect(alarm.textContent).toContain("1");

    await userEvent.click(alarm);
    expect(screen.getByText(UNDELIVERED.subject)).toBeInTheDocument();
    expect(screen.getByTitle(UNDELIVERED.subject)).toBeInTheDocument();
    // Says why an email's text is being read here rather than in an inbox.
    expect(screen.getByText("הודעות שנשלחו אליכם ולא הגיעו לדוא״ל:")).toBeInTheDocument();
  });

  it("names the verification request as the way to start receiving the mail", async () => {
    render(<Header {...props} undelivered={[UNDELIVERED]} />);

    await userEvent.click(screen.getByRole("button", { name: "התראות ממתינות" }));
    const hint = screen.getByText(/בקשת אימות הכתובת/);
    // The sender is what makes the request findable, and spam is where it usually sits.
    expect(hint).toHaveTextContent("Amazon Web Services");
    expect(hint).toHaveTextContent("ספאם");
  });

  it("keeps both framing lines out of the way while nothing went undelivered", async () => {
    render(<Header {...props} activeViolations={["חריגה"]} />);

    await userEvent.click(screen.getByRole("button", { name: "התראות ממתינות" }));
    expect(screen.queryByText(/בקשת אימות הכתובת/)).toBeNull();
    expect(screen.queryByText(/ולא הגיעו לדוא/)).toBeNull();
  });

  it("counts violations and undelivered messages together in the one badge", async () => {
    render(<Header {...props} activeViolations={["חריגה"]} undelivered={[UNDELIVERED]} />);

    expect(screen.getByRole("button", { name: "התראות ממתינות" }).textContent).toContain("2");
  });

  it("dates an undelivered message by when it was refused", async () => {
    render(<Header {...props} undelivered={[UNDELIVERED]} />);

    await userEvent.click(screen.getByRole("button", { name: "התראות ממתינות" }));
    expect(screen.getByText(instantLabel(UNDELIVERED.at))).toBeInTheDocument();
  });

  it("dismisses an undelivered message by the timestamp it is stored under", async () => {
    const onDismissUndelivered = vi.fn();
    render(<Header {...props} undelivered={[UNDELIVERED]}
                   onDismissUndelivered={onDismissUndelivered} />);

    await userEvent.click(screen.getByRole("button", { name: "התראות ממתינות" }));
    await userEvent.click(screen.getByRole("button",
      { name: `סגירת ההודעה ${UNDELIVERED.subject}` }));

    expect(onDismissUndelivered).toHaveBeenCalledWith(UNDELIVERED.at);
  });

  it("shows a refused message as the mail it was, in a frame that may only draw it", async () => {
    // The bell presents the email itself, so the server's HTML rides into a sandboxed frame
    // rather than being re-typeset from the plain body.
    render(<Header {...props} undelivered={[UNDELIVERED]} />);

    await userEvent.click(screen.getByRole("button", { name: "התראות ממתינות" }));
    const frame = screen.getByTitle(UNDELIVERED.subject) as HTMLIFrameElement;
    expect(frame.getAttribute("srcdoc")).toBe(UNDELIVERED.html);
    expect(frame.getAttribute("sandbox")).toBe("");
  });

  it("keeps a violation and an undelivered message visually apart", async () => {
    render(<Header {...props} activeViolations={["חריגה"]} undelivered={[UNDELIVERED]} />);

    await userEvent.click(screen.getByRole("button", { name: "התראות ממתינות" }));
    // The violation keeps the alarm red; the message that never arrived is not the user's
    // failing and reads as a plain notice.
    expect(screen.getByText("חריגה")).toHaveClass("alert");
    expect(screen.getByText(UNDELIVERED.subject).closest("div")).toHaveClass("notice");
  });
});
