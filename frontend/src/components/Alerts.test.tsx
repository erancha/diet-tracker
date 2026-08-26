import { act, render, screen } from "@testing-library/react";
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
