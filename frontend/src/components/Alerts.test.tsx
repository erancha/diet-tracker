import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Alerts } from "./Alerts";

describe("Alerts", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("dismisses a batch of successes on its own", () => {
    const onDismiss = vi.fn();
    render(<Alerts items={[{ kind: "ok", message: "נשמר" }]} onDismiss={onDismiss} />);
    expect(screen.getByText("נשמר")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(5000));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("leaves a batch carrying a violation on screen", () => {
    const onDismiss = vi.fn();
    render(<Alerts items={[{ kind: "ok", message: "נשמר" }, { kind: "alert", message: "חריגה" }]}
                   onDismiss={onDismiss} />);

    act(() => vi.advanceTimersByTime(60_000));

    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByText("חריגה")).toBeInTheDocument();
  });

  it("leaves a batch carrying a notice on screen", () => {
    const onDismiss = vi.fn();
    render(<Alerts items={[{ kind: "ok", message: "נשמר" },
                           { kind: "notice", message: "היעד טרם נקבע" }]} onDismiss={onDismiss} />);

    act(() => vi.advanceTimersByTime(60_000));

    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByText("היעד טרם נקבע")).toBeInTheDocument();
  });

  it("leaves a notice marked as fading standing past a success's time", () => {
    const onDismiss = vi.fn();
    render(<Alerts items={[{ kind: "notice", message: "אתמול חצה סף", fades: true }]}
                   onDismiss={onDismiss} />);

    act(() => vi.advanceTimersByTime(5000));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("dismisses a notice marked as fading", () => {
    const onDismiss = vi.fn();
    render(<Alerts items={[{ kind: "notice", message: "אתמול חצה סף", fades: true }]}
                   onDismiss={onDismiss} />);

    act(() => vi.advanceTimersByTime(10_000));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("turns the named word of a message into the link it carries", () => {
    const onClick = vi.fn();
    render(<Alerts items={[{ kind: "crossing", message: "אתמול חצה סף",
                            link: { word: "אתמול", onClick } }]} onDismiss={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "אתמול" }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByText(/חצה סף/)).toHaveClass("crossing");
  });

  it("keeps a fading notice on screen while an unmarked item shares its batch", () => {
    const onDismiss = vi.fn();
    render(<Alerts items={[{ kind: "notice", message: "אתמול חצה סף", fades: true },
                           { kind: "alert", message: "השמירה נכשלה" }]} onDismiss={onDismiss} />);

    act(() => vi.advanceTimersByTime(60_000));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("scrolls a fresh batch into view", () => {
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    const { rerender } = render(<Alerts items={[]} onDismiss={vi.fn()} />);
    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender(<Alerts items={[{ kind: "alert", message: "חריגה" }]} onDismiss={vi.fn()} />);

    expect(scrollIntoView).toHaveBeenCalledOnce();
    scrollIntoView.mockRestore();
  });
});
