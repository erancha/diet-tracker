import { describe, expect, it } from "vitest";
import { dayEnded, dayLabel, daysBefore, daysSince, ddmmLabel, defaultDay, expandMealForm, expandQuestionnaire, expandWeightSection, isWeighInDay, isoDate, last7Days, parseIsoDate, weekdayDdmmLabel, weekdayLetter } from "./dates";

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

describe("expandMealForm", () => {
  const eleven = new Date(2026, 7, 18, 11, 0);
  const beforeEleven = new Date(2026, 7, 18, 10, 59);
  const firstMealHour = 11;
  const mealGapHours = 4;
  // Absolute instants on both sides of the comparison, so the gap between a meal and the clock is
  // the same wherever the test runs.
  const mealAt = (hour: number, minute = 0) => ({ at: new Date(2026, 7, 18, hour, minute).toISOString() });

  it("expands from the first-meal hour on a day with nothing recorded", () => {
    expect(expandMealForm(eleven, firstMealHour, mealGapHours, [])).toBe(true);
  });

  it("stays collapsed before the first-meal hour", () => {
    expect(expandMealForm(beforeEleven, firstMealHour, mealGapHours, [])).toBe(false);
  });

  it("respects a different configured first-meal hour", () => {
    expect(expandMealForm(beforeEleven, 10, mealGapHours, [])).toBe(true);
  });

  it("stays collapsed while the last recorded meal is younger than the gap", () => {
    expect(expandMealForm(eleven, firstMealHour, mealGapHours, [mealAt(7, 1)])).toBe(false);
  });

  it("expands once the gap since the last recorded meal is reached", () => {
    expect(expandMealForm(eleven, firstMealHour, mealGapHours, [mealAt(7)])).toBe(true);
  });

  it("measures the gap from the latest meal whatever order the meals arrive in", () => {
    expect(expandMealForm(eleven, firstMealHour, mealGapHours, [mealAt(10), mealAt(6)])).toBe(false);
  });

  it("expands on a stale meal even before the first-meal hour", () => {
    expect(expandMealForm(beforeEleven, firstMealHour, mealGapHours, [mealAt(6)])).toBe(true);
  });

  it("respects a different configured gap", () => {
    expect(expandMealForm(eleven, firstMealHour, 2, [mealAt(8, 30)])).toBe(true);
    expect(expandMealForm(eleven, firstMealHour, 6, [mealAt(8, 30)])).toBe(false);
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

// 2026-08-27 is a Thursday; 2026-08-26 the Wednesday before it.
const THURSDAY = new Date(2026, 7, 27, 8, 0);
const WEDNESDAY = new Date(2026, 7, 26, 8, 0);

describe("isWeighInDay", () => {
  it("matches the configured weekday token against the day now falls on", () => {
    expect(isWeighInDay(THURSDAY, "THU")).toBe(true);
    expect(isWeighInDay(WEDNESDAY, "THU")).toBe(false);
  });

  it("refuses a weekday the config could not have held, rather than never matching", () => {
    expect(() => isWeighInDay(THURSDAY, "THURSDAY")).toThrow("unknown weekday");
  });
});

describe("weekdayLetter", () => {
  it("names the configured weekday the way the rest of the app writes weekdays", () => {
    expect(weekdayLetter("THU")).toBe("ה");
    expect(weekdayLetter("SUN")).toBe("א");
    expect(weekdayLetter("SAT")).toBe("ש");
  });
});

describe("daysSince", () => {
  it("counts whole calendar days regardless of the hour now sits at", () => {
    expect(daysSince("2026-08-27", THURSDAY)).toBe(0);
    expect(daysSince("2026-08-26", THURSDAY)).toBe(1);
    expect(daysSince("2026-08-20", THURSDAY)).toBe(7);
  });

  it("counts whole days across a clock shift, where the runner's zone observes one", () => {
    // Israel moves off DST in the night of 2026-10-24, making that Sunday 25 hours long. The
    // rounding is what keeps the extra hour from reading as a day and a bit.
    expect(daysSince("2026-10-24", new Date(2026, 9, 26, 8, 0))).toBe(2);
  });
});

describe("expandWeightSection", () => {
  it("opens on the weigh-in day while the day holds no weighing", () => {
    expect(expandWeightSection(THURSDAY, "THU", [{ date: "2026-08-20" }])).toBe(true);
  });

  it("stays folded once the day has been weighed", () => {
    expect(expandWeightSection(THURSDAY, "THU", [{ date: "2026-08-27" }])).toBe(false);
  });

  it("stays folded on every other day, weighed or not", () => {
    expect(expandWeightSection(WEDNESDAY, "THU", [])).toBe(false);
  });
});
