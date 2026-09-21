import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWindDownFold, WIND_DOWN_FOLD_MS, WIND_DOWN_SWEEP_MS } from "./useWindDownFold";

afterEach(() => vi.useRealTimers());

describe("hold duration", () => {
  it("folds after its default hold unless told to stand for another", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useWindDownFold(true, false));
    act(() => { vi.advanceTimersByTime(WIND_DOWN_FOLD_MS + WIND_DOWN_SWEEP_MS); });
    expect(result.current.collapsed).toBe(true);
  });

  it("holds for the duration the caller names", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useWindDownFold(true, false, 5_000));
    act(() => { vi.advanceTimersByTime(5_000 - 1); });
    expect(result.current.folding).toBe(false);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.folding).toBe(true);
    act(() => { vi.advanceTimersByTime(WIND_DOWN_SWEEP_MS); });
    expect(result.current.collapsed).toBe(true);
  });

  it("hands the hold to the style sheet as a custom property", () => {
    const { result } = renderHook(() => useWindDownFold(true, false, 5_000));
    expect(result.current.style).toEqual({ "--wind-down-hold": "5000ms" });
  });
});
