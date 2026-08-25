import { describe, expect, it } from "vitest";
import { dayEnded, dayLabel, daysBefore, ddmmLabel, defaultDay, expandQuestionnaire, isoDate, last7Days, parseIsoDate, weekdayDdmmLabel } from "./dates";

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

describe("ddmmLabel", () => {
  it("renders DD/MM with zero padding and no year", () => {
    expect(ddmmLabel("2026-08-05")).toBe("05/08");
  });
});

describe("weekdayDdmmLabel", () => {
  it("prefixes DD/MM with the Hebrew weekday letter", () => {
    expect(weekdayDdmmLabel("2026-08-05")).toBe("ד׳ 05/08");
  });

  it("labels Saturday with ש rather than a numeral letter", () => {
    expect(weekdayDdmmLabel("2026-08-22")).toBe("ש׳ 22/08");
  });
});

describe("daysBefore", () => {
  it("counts back within the month", () => {
    expect(daysBefore("2026-08-18", 6)).toBe("2026-08-12");
  });

  it("returns the date itself for a zero offset", () => {
    expect(daysBefore("2026-08-18", 0)).toBe("2026-08-18");
  });

  it("crosses a month boundary", () => {
    expect(daysBefore("2026-08-03", 6)).toBe("2026-07-28");
  });

  it("crosses a year boundary", () => {
    expect(daysBefore("2026-01-03", 6)).toBe("2025-12-28");
  });

  it("lands on the leap day counting back into February 2028", () => {
    expect(daysBefore("2028-03-01", 1)).toBe("2028-02-29");
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

describe("dayEnded", () => {
  it("counts the day as ended from the reminder hour onward", () => {
    expect(dayEnded(new Date(2026, 7, 18, 20, 0), 20)).toBe(true);
  });

  it("counts the day as still running before the reminder hour", () => {
    expect(dayEnded(new Date(2026, 7, 18, 19, 59), 20)).toBe(false);
  });

  it("counts the after-midnight hours as the new day still running", () => {
    expect(dayEnded(new Date(2026, 7, 18, 2, 0), 20)).toBe(false);
  });
});

describe("defaultDay", () => {
  it("defaults to yesterday while today is still running", () => {
    expect(defaultDay(new Date(2026, 7, 18, 10, 0), 20)).toBe("yesterday");
  });

  it("defaults to yesterday after midnight", () => {
    expect(defaultDay(new Date(2026, 7, 18, 2, 0), 20)).toBe("yesterday");
  });

  it("defaults to today once the day has ended", () => {
    expect(defaultDay(new Date(2026, 7, 18, 21, 0), 20)).toBe("today");
  });

  it("follows a different configured reminder hour", () => {
    expect(defaultDay(new Date(2026, 7, 18, 19, 0), 19)).toBe("today");
  });
});

describe("expandQuestionnaire", () => {
  const eightPm = new Date(2026, 7, 18, 20, 0);
  const beforeEight = new Date(2026, 7, 18, 19, 59);
  const reminderHour = 20;

  it("expands from the reminder hour on an untracked, unsubmitted day", () => {
    expect(expandQuestionnaire(eightPm, reminderHour, 0, false)).toBe(true);
  });

  it("stays collapsed before the reminder hour", () => {
    expect(expandQuestionnaire(beforeEight, reminderHour, 0, false)).toBe(false);
  });

  it("respects a different configured reminder hour", () => {
    expect(expandQuestionnaire(beforeEight, 19, 0, false)).toBe(true);
  });

  it("stays collapsed when meals were recorded", () => {
    expect(expandQuestionnaire(eightPm, reminderHour, 2, false)).toBe(false);
  });

  it("stays collapsed once today is submitted", () => {
    expect(expandQuestionnaire(eightPm, reminderHour, 0, true)).toBe(false);
  });
});
