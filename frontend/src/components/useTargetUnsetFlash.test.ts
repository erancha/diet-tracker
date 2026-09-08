import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TARGET_FLASH_DELAY_MS, TARGET_FLASH_MS, useTargetUnsetFlash } from "./useTargetUnsetFlash";

describe("useTargetUnsetFlash", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("rests for the delay, flashes for the target stretch, then rests for good", () => {
    const { result } = renderHook(() => useTargetUnsetFlash(true));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(TARGET_FLASH_DELAY_MS - 1));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(TARGET_FLASH_MS - 1));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(600_000));
    expect(result.current).toBe(false);
  });

  it("stays dark while inactive", () => {
    const { result } = renderHook(() => useTargetUnsetFlash(false));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toBe(false);
  });
});
