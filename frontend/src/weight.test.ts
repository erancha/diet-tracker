import { describe, expect, it } from "vitest";
import { activeSpan, chartDomain, entriesWithin, kgLabel, offeredSpans, rhythmReading,
         overTargetSeverity, summarize, targetChangePrompt, usualHour } from "./weight";
import type { WeightEntry } from "./types";

const TODAY = new Date(2026, 7, 27); // 2026-08-27

const SERIES: WeightEntry[] = [
  { date: "2025-08-27", kg: 82, at: null },
  { date: "2026-02-27", kg: 79, at: null },
  { date: "2026-06-27", kg: 77.4, at: null },
  { date: "2026-08-20", kg: 76.5, at: null },
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
    const old: WeightEntry[] = [{ date: "2023-01-01", kg: 90, at: null }];
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
    const [min, max] = chartDomain([{ date: "2026-08-20", kg: 80, at: null }], 70);
    expect(min).toBeLessThan(70);
    expect(max).toBeGreaterThan(80);
  });

  it("gives a flat series headroom rather than collapsing to a line of zero height", () => {
    const [min, max] = chartDomain([{ date: "2026-08-20", kg: 76, at: null }], null);
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

describe("overTargetSeverity", () => {
  it("grades a measurement by how far it sits above the target", () => {
    expect(overTargetSeverity(105.4, 95)).toBe("far");
    expect(overTargetSeverity(104.9, 95)).toBe("over");
    expect(overTargetSeverity(105, 95)).toBe("over");
  });

  it("reads nothing at or below the target, or where the gap is too small to show", () => {
    expect(overTargetSeverity(94, 95)).toBeNull();
    expect(overTargetSeverity(95, 95)).toBeNull();
    expect(overTargetSeverity(95.04, 95)).toBeNull();
  });

  it("reads nothing before a target has been set", () => {
    expect(overTargetSeverity(105.4, null)).toBeNull();
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

// 2026-08-27 is a Thursday, so THU is the weigh-in weekday these read against and 2026-08-26 is
// the Wednesday before it.
const THU = "THU";
const timed = (date: string, at: string | null): WeightEntry => ({ date, kg: 76, at });

describe("usualHour", () => {
  it("names the middle recorded time, so a stray late weighing does not become the rhythm", () => {
    expect(usualHour([timed("2026-08-06", "07:20"), timed("2026-08-13", "22:40"),
                      timed("2026-08-20", "07:30")])).toBe("07:30");
  });

  it("stays silent until enough weighings carry a time to call one usual", () => {
    expect(usualHour([])).toBeNull();
    expect(usualHour([timed("2026-08-13", "07:20"), timed("2026-08-20", "07:30")])).toBeNull();
  });

  it("reads past weighings recorded before the time was kept", () => {
    expect(usualHour([timed("2026-07-30", null), timed("2026-08-06", "08:00"),
                      timed("2026-08-13", "07:00"), timed("2026-08-20", "07:30")])).toBe("07:30");
  });

  it("follows a rhythm that has moved, rather than averaging in the one it left", () => {
    const moved = [...Array(6)].map((_, i) => timed(`2026-06-0${i + 1}`, "22:00"))
      .concat([...Array(8)].map((_, i) => timed(`2026-08-0${i + 1}`, "07:30")));
    expect(usualHour(moved)).toBe("07:30");
  });
});

describe("rhythmReading", () => {
  it("says nothing before the first weighing", () => {
    expect(rhythmReading([], THU, TODAY)).toBeNull();
  });

  it("names the weigh-in day while the scale has not been stepped on", () => {
    expect(rhythmReading([timed("2026-08-20", null)], THU, TODAY)).toBe("היום יום השקילה");
  });

  it("says nothing on the weigh-in day once it has been answered", () => {
    expect(rhythmReading([timed("2026-08-27", "07:30")], THU, TODAY)).toBeNull();
  });

  it("points at the next weigh-in day on every other day", () => {
    const wednesday = new Date(2026, 7, 26);
    expect(rhythmReading([timed("2026-08-20", null)], THU, wednesday))
      .toBe("השקילה הבאה ביום ה׳");
  });

  it("states how long it has been once a whole week has passed", () => {
    expect(rhythmReading([timed("2026-08-11", null)], THU, TODAY)).toBe("נשקלת לפני 16 ימים");
  });

  it("carries the usual hour once there is one, and only then", () => {
    const timedSeries = [timed("2026-08-06", "07:20"), timed("2026-08-13", "07:40"),
                         timed("2026-08-20", "07:30")];
    expect(rhythmReading(timedSeries, THU, TODAY)).toBe("היום יום השקילה · בסביבות 07:30");
    expect(rhythmReading([timed("2026-08-20", "07:30")], THU, TODAY)).toBe("היום יום השקילה");
  });
});
