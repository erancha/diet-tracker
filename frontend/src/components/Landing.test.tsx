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

  it("spells the שכפ\"צ acronym down its principles table, after the app summary", () => {
    const { container } = render(<Landing onSignIn={() => {}} />);

    const principles = [...container.querySelectorAll(".landing-principles tbody tr")]
      .map((row) => row.querySelector("td")!.textContent!.trim());
    expect(principles).toHaveLength(4);
    expect(principles.map((p) => p[0]).join("")).toBe("שכפצ");

    const summary = container.querySelector(".landing-summary")!;
    const table = container.querySelector(".landing-principles")!;
    expect(summary.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it("points the acronym's first mention at the table that spells it out", () => {
    const { container } = render(<Landing onSignIn={() => {}} />);

    const link = container.querySelector(".landing-intro a")!;
    expect(container.querySelector(".landing-principles")!.id)
      .toBe(link.getAttribute("href")!.slice(1));
  });

  it("mentions each tracked value once across the summary bullets", () => {
    const { container } = render(<Landing onSignIn={() => {}} />);

    const summaryText = [...container.querySelectorAll(".landing-summary li")]
      .map((item) => item.textContent)
      .join(" ");
    for (const term of ["פחמימות / קמחים / סוכרים", "ירקות"]) {
      expect(summaryText.split(term).length - 1).toBe(1);
    }
  });

  it("mentions the chat answering questions from the diet's source documents", () => {
    const { container } = render(<Landing onSignIn={() => {}} />);

    const summaryText = [...container.querySelectorAll(".landing-summary li")]
      .map((item) => item.textContent)
      .join(" ");
    expect(summaryText).toContain("צ'אט");
    expect(summaryText).toContain("מסמכי המקור");
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
