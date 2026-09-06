import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INTRO_STAGE_MS, MEAL_NUDGE_AT_MS, useWelcomeIntro } from "./useWelcomeIntro";

describe("useWelcomeIntro", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("walks the sentences and the target line, rests, then settles on the add-meal invitation", () => {
    const { result } = renderHook(() => useWelcomeIntro(true));
    expect(result.current).toBe(0);
    // The opening sentence outlasts a middle sentence's beat.
    act(() => vi.advanceTimersByTime(INTRO_STAGE_MS[1]));
    expect(result.current).toBe(0);
    act(() => vi.advanceTimersByTime(INTRO_STAGE_MS[0] - INTRO_STAGE_MS[1]));
    expect(result.current).toBe(1);
    act(() => vi.advanceTimersByTime(INTRO_STAGE_MS[1]));
    expect(result.current).toBe(2);
    act(() => vi.advanceTimersByTime(INTRO_STAGE_MS[2]));
    expect(result.current).toBe(3);
    act(() => vi.advanceTimersByTime(INTRO_STAGE_MS[3]));
    expect(result.current).toBe("rest");

    // The invitation lands measured from the page opening, not from the flashes' end.
    const flashes = Object.values(INTRO_STAGE_MS).reduce((a, b) => a + b, 0);
    act(() => vi.advanceTimersByTime(MEAL_NUDGE_AT_MS - flashes - 1));
    expect(result.current).toBe("rest");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("meal");
    act(() => vi.advanceTimersByTime(600_000));
    expect(result.current).toBe("meal");
  });

  it("stays dark while inactive", () => {
    const { result } = renderHook(() => useWelcomeIntro(false));
    expect(result.current).toBeNull();
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toBeNull();
  });
});
