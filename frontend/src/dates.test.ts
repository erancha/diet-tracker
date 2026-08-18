import { describe, expect, it } from "vitest";
import { dayLabel, defaultDay, isoDate, last7Days, parseIsoDate } from "./dates";

describe("isoDate", () => {
  it("formats a local date as YYYY-MM-DD with zero padding", () => {
    expect(isoDate(new Date(2026, 7, 5))).toBe("2026-08-05");
  });
});

describe("parseIsoDate", () => {
  it("round-trips with isoDate as a local calendar day", () => {
    const d = parseIsoDate("2026-08-18");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 7, 18]);
    expect(isoDate(d)).toBe("2026-08-18");
  });
});

describe("dayLabel", () => {
  it("renders day.month without leading zeros", () => {
    expect(dayLabel("2026-08-05")).toBe("5.8");
  });
});

describe("last7Days", () => {
  it("returns the 7 days ending at the given date, inclusive", () => {
    const days = last7Days("2026-08-18");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-08-12");
    expect(days[6]).toBe("2026-08-18");
  });

  it("crosses month boundaries", () => {
    expect(last7Days("2026-08-03")[0]).toBe("2026-07-28");
  });
});

describe("defaultDay", () => {
  const twoAm = new Date(2026, 7, 18, 2, 0);
  const tenAm = new Date(2026, 7, 18, 10, 0);

  it("defaults to yesterday before 04:00 when neither day is filled", () => {
    expect(defaultDay(twoAm, new Set())).toBe("yesterday");
  });

  it("defaults to today before 04:00 once yesterday is already filled", () => {
    expect(defaultDay(twoAm, new Set(["2026-08-17"]))).toBe("today");
  });

  it("defaults to today before 04:00 once today is already filled", () => {
    expect(defaultDay(twoAm, new Set(["2026-08-18"]))).toBe("today");
  });

  it("defaults to today during normal hours", () => {
    expect(defaultDay(tenAm, new Set())).toBe("today");
  });
});
