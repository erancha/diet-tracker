import { describe, expect, it } from "vitest";
import { activeSpan, chartDomain, entriesWithin, kgLabel, offeredSpans, summarize,
         targetChangePrompt } from "./weight";
import type { WeightEntry } from "./types";

const TODAY = new Date(2026, 7, 27); // 2026-08-27

const SERIES: WeightEntry[] = [
  { date: "2025-08-27", kg: 82 },
  { date: "2026-02-27", kg: 79 },
  { date: "2026-06-27", kg: 77.4 },
  { date: "2026-08-20", kg: 76.5 },
];

describe("entriesWithin", () => {
  it("counts the span back in calendar months and keeps its boundary day", () => {
    expect(entriesWithin(SERIES, 1, TODAY).map((e) => e.date)).toEqual(["2026-08-20"]);
    expect(entriesWithin(SERIES, 3, TODAY).map((e) => e.date)).toEqual(["2026-06-27", "2026-08-20"]);
    expect(entriesWithin(SERIES, 12, TODAY).map((e) => e.date)).toEqual([
      "2025-08-27", "2026-02-27", "2026-06-27", "2026-08-20"]);
  });

  it("returns the series whole for הכל", () => {
    expect(entriesWithin(SERIES, null, TODAY)).toEqual(SERIES);
  });
});

describe("offeredSpans", () => {
  it("drops a span that would redraw what a narrower one already shows", () => {
    // Every entry falls inside a year, so הכל redraws the same points as שנה.
    expect(offeredSpans(SERIES, TODAY)).toEqual([1, 3, 6, 12]);
  });

  it("drops a span reaching no point at all", () => {
    const old: WeightEntry[] = [{ date: "2023-01-01", kg: 90 }];
    expect(offeredSpans(old, TODAY)).toEqual([null]);
  });

  it("offers nothing for an empty series", () => {
    expect(offeredSpans([], TODAY)).toEqual([]);
  });
});

describe("activeSpan", () => {
  it("keeps the reader's choice while the series still offers it", () => {
    expect(activeSpan([1, 3, 12], 3)).toBe(3);
  });

  it("falls back to the widest span rather than leaving the chart blank", () => {
    // A series older than the opening span: falling back to the narrowest would plot nothing.
    expect(activeSpan([null], 3)).toBeNull();
    expect(activeSpan([1, 12], 3)).toBe(12);
  });

  it("resolves to הכל when the series offers no span at all", () => {
    expect(activeSpan([], 3)).toBeNull();
  });
});

describe("chartDomain", () => {
  it("keeps a target outside the plotted weights on screen", () => {
    const [min, max] = chartDomain([{ date: "2026-08-20", kg: 80 }], 70);
    expect(min).toBeLessThan(70);
    expect(max).toBeGreaterThan(80);
  });

  it("gives a flat series headroom rather than collapsing to a line of zero height", () => {
    const [min, max] = chartDomain([{ date: "2026-08-20", kg: 76 }], null);
    expect(max - min).toBeGreaterThan(0);
    expect(min).toBeLessThan(76);
    expect(max).toBeGreaterThan(76);
  });
});

describe("kgLabel", () => {
  it("shows a fraction only when there is one", () => {
    expect(kgLabel(76)).toBe("76");
    expect(kgLabel(76.5)).toBe("76.5");
    expect(kgLabel(76.44)).toBe("76.4");
  });
});

describe("summarize", () => {
  it("reads the latest weight against the target in both directions", () => {
    expect(summarize(SERIES, 72)).toEqual({
      latest: 76.5, target: 72, gapKg: 4.5, prefix: "מעל ה", overTarget: true,
    });
    expect(summarize(SERIES, 80)).toEqual({
      latest: 76.5, target: 80, gapKg: 3.5, prefix: "מתחת ל", overTarget: false,
    });
  });

  it("states no distance once the gap is too small to show", () => {
    expect(summarize(SERIES, 76.5)).toEqual({ latest: 76.5, target: 76.5, gapKg: null, prefix: "ב", overTarget: false });
    expect(summarize(SERIES, 76.48)).toEqual({ latest: 76.5, target: 76.48, gapKg: null, prefix: "ב", overTarget: false });
  });

  it("still reads before a target exists, so the line can offer to set one", () => {
    expect(summarize(SERIES, null)).toEqual({ latest: 76.5, target: null, gapKg: null, prefix: "ה", overTarget: false });
  });

  it("still reads before the first weighing, so the target is reachable from the start", () => {
    expect(summarize([], 72)).toEqual({ latest: null, target: 72, gapKg: null, prefix: "ה", overTarget: false });
    expect(summarize([], null)).toEqual({ latest: null, target: null, gapKg: null, prefix: "ה", overTarget: false });
  });
});

describe("targetChangePrompt", () => {
  it("offers to set a target that never existed", () => {
    expect(targetChangePrompt(72, null)).toBe("לקבוע את משקל היעד ל-72 ק״ג?");
  });

  it("offers to update one that already stands", () => {
    expect(targetChangePrompt(72, 75)).toBe("לעדכן את משקל היעד ל-72 ק״ג?");
  });
});
