import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VERIFY_MAIL_QUESTION, Welcome } from "./Welcome";

describe("Welcome", () => {
  it("opens on a greeting and lists the three tracking steps and the mail step", () => {
    render(<Welcome autoFold={false} mailStep onAskChat={vi.fn()} />);

    expect(screen.getByRole("heading", { name: /ברוכים הבאים/ })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("lists the three tracking steps alone for an address already verified", () => {
    render(<Welcome autoFold={false} mailStep={false} onAskChat={vi.fn()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "אישור המייל" })).not.toBeInTheDocument();
  });

  it("folds the steps behind the greeting, leaving the heading in place", () => {
    render(<Welcome autoFold={false} mailStep onAskChat={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: /ברוכים הבאים/ });

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: /ברוכים הבאים/ })).toBeInTheDocument();
  });

  it("tucks the steps away when the intro ends", () => {
    const { rerender } = render(<Welcome autoFold={false} mailStep onAskChat={vi.fn()} />);
    rerender(<Welcome autoFold mailStep onAskChat={vi.fn()} />);

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("leaves a fold a hand toggle already claimed alone", () => {
    const { rerender } = render(<Welcome autoFold={false} mailStep onAskChat={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: /ברוכים הבאים/ });
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    rerender(<Welcome autoFold mailStep onAskChat={vi.fn()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("hands the chat the mail-confirmation question from its button", () => {
    const onAskChat = vi.fn();
    render(<Welcome autoFold={false} mailStep onAskChat={onAskChat} />);

    fireEvent.click(screen.getByRole("button", { name: "אישור המייל" }));

    expect(onAskChat).toHaveBeenCalledWith(VERIFY_MAIL_QUESTION);
  });
});
