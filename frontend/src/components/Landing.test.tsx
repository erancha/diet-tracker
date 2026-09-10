import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Landing } from "./Landing";

const expandLanding = () => userEvent.click(screen.getByRole("button", { name: "יותר" }));

describe("Landing", () => {
  it("opens condensed: three paragraphs, then the more and sign-in buttons", () => {
    const { container } = render(<Landing onSignIn={() => {}} chatAvailable />);

    expect(screen.getByRole("heading", { name: "מעקב תזונה AI" })).toBeInTheDocument();
    expect(container.querySelector("h1 img.app-icon")).toHaveAttribute("src", "favicon.svg");
    expect(container.querySelector("main")).toHaveClass("landing-brief");
    expect(container.querySelectorAll(".landing-condensed")).toHaveLength(3);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "התחברות עם Google" })).toBeInTheDocument();
  });

  it("withholds the chat from both views where no answering service is configured", async () => {
    const { container } = render(<Landing onSignIn={() => {}} chatAvailable={false} />);

    expect(container.querySelectorAll(".landing-condensed")).toHaveLength(2);
    expect(screen.queryByText(/עוזר AI/)).not.toBeInTheDocument();

    await expandLanding();

    expect(screen.queryByText(/בצ'אט בתוך האפליקציה/)).not.toBeInTheDocument();
  });

  it("spells the שכפ\"צ acronym in place inside the condensed intro", () => {
    const { container } = render(<Landing onSignIn={() => {}} chatAvailable />);

    const condensedText = [...container.querySelectorAll(".landing-condensed")]
      .map((paragraph) => paragraph.textContent)
      .join(" ");
    for (const principle of ["שתיה", "כמות ירקות", "פתיחת חלון אכילה", "צמצום ארוחות"]) {
      expect(condensedText).toContain(principle);
    }
  });

  it("replaces the condensed intro with the full summary when expanded", async () => {
    const { container } = render(<Landing onSignIn={() => {}} chatAvailable />);

    await expandLanding();

    expect(container.querySelector(".landing-condensed")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "יותר" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("spells the שכפ\"צ acronym down its principles table, after the app summary", async () => {
    const { container } = render(<Landing onSignIn={() => {}} chatAvailable />);

    await expandLanding();

    const principles = [...container.querySelectorAll(".landing-principles tbody tr")]
      .map((row) => row.querySelector("td")!.textContent!.trim());
    expect(principles).toHaveLength(4);
    expect(principles.map((p) => p[0]).join("")).toBe("שכפצ");

    const summary = container.querySelector(".landing-summary")!;
    const table = container.querySelector(".landing-principles")!;
    expect(summary.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it("points the acronym's first mention at the table that spells it out", async () => {
    const { container } = render(<Landing onSignIn={() => {}} chatAvailable />);

    await expandLanding();

    const link = container.querySelector(".landing-intro a")!;
    expect(container.querySelector(".landing-principles")!.id)
      .toBe(link.getAttribute("href")!.slice(1));
  });

  it("mentions each tracked value once across the summary bullets", async () => {
    const { container } = render(<Landing onSignIn={() => {}} chatAvailable />);

    await expandLanding();

    const summaryText = [...container.querySelectorAll(".landing-summary li")]
      .map((item) => item.textContent)
      .join(" ");
    for (const term of ["פחמימות / קמחים / סוכרים", "ירקות"]) {
      expect(summaryText.split(term).length - 1).toBe(1);
    }
  });

  it("mentions the chat answering questions from the diet's source documents", async () => {
    const { container } = render(<Landing onSignIn={() => {}} chatAvailable />);

    await expandLanding();

    const summaryText = [...container.querySelectorAll(".landing-summary li")]
      .map((item) => item.textContent)
      .join(" ");
    expect(summaryText).toContain("צ'אט");
    expect(summaryText).toContain("מסמכי המקור");
  });

  it("offers the walkthrough in both modes, above the invite it leads", async () => {
    render(<Landing onSignIn={() => {}} chatAvailable />);

    const walkthrough = () => screen.getByRole("link", { name: "הדגמה: יום ביומן" });
    expect(walkthrough()).toHaveAttribute("href", "demo.html");
    // The note rides beside the link rather than inside it, so the link's name stays the page's.
    expect(walkthrough().parentElement).toHaveTextContent("(ניתן להאט את ההדגמה, מומלץ לראות במסך מחשב)");
    // The footer links read walkthrough, invite, repo — the order the stylesheet spaces them in.
    expect(walkthrough().compareDocumentPosition(
      screen.getByRole("link", { name: "הזמנת חברים ב-WhatsApp" }),
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await expandLanding();

    expect(walkthrough()).toHaveAttribute("href", "demo.html");
  });

  it("links to the source repository in both modes", async () => {
    render(<Landing onSignIn={() => {}} chatAvailable />);

    expect(screen.getByRole("link", { name: "קוד המקור ב-GitHub" })).toHaveAttribute(
      "href", "https://github.com/erancha/diet-tracker",
    );

    await expandLanding();

    expect(screen.getByRole("link", { name: "קוד המקור ב-GitHub" })).toHaveAttribute(
      "href", "https://github.com/erancha/diet-tracker",
    );
  });

  it("offers the WhatsApp invite in both modes, speaking as an invitee rather than the developer",
     async () => {
    render(<Landing onSignIn={() => {}} chatAvailable />);

    const inviteHref = () =>
      screen.getByRole("link", { name: "הזמנת חברים ב-WhatsApp" }).getAttribute("href")!;
    expect(inviteHref()).toContain("https://wa.me/?text=");
    expect(inviteHref()).toContain(encodeURIComponent("קיבלתי המלצה"));

    await expandLanding();

    expect(inviteHref()).toContain(encodeURIComponent("קיבלתי המלצה"));
  });

  it("offers פחות above the sign-in button once expanded, folding back to the condensed intro", async () => {
    const { container } = render(<Landing onSignIn={() => {}} chatAvailable />);

    await expandLanding();

    const less = screen.getByRole("button", { name: "פחות" });
    const signIn = screen.getByRole("button", { name: "התחברות עם Google" });
    expect(less.compareDocumentPosition(signIn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.click(less);

    expect(container.querySelectorAll(".landing-condensed")).toHaveLength(3);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("invokes onSignIn from the condensed state", async () => {
    const onSignIn = vi.fn();
    render(<Landing onSignIn={onSignIn} chatAvailable />);

    await userEvent.click(screen.getByRole("button", { name: "התחברות עם Google" }));

    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it("invokes onSignIn from the expanded state", async () => {
    const onSignIn = vi.fn();
    render(<Landing onSignIn={onSignIn} chatAvailable />);

    await expandLanding();
    await userEvent.click(screen.getByRole("button", { name: "התחברות עם Google" }));

    expect(onSignIn).toHaveBeenCalledOnce();
  });
});
