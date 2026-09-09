import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrendChart } from "./TrendChart";
import { fixtureQuestionnaire } from "../test-fixtures";
import type { Day, DayPayload, Question, Questionnaire } from "../types";

const days: Day[] = [
  { date: "2026-08-17", answers: { drinking: 2, window: 8 }, excluded: 0 },
  { date: "2026-08-18", answers: { drinking: 3, window: 13 }, excluded: 0 },
];

// The weekday the treat meal is aimed at, as config/app.json declares it.
const TREAT_DAY = { weekday: "FRI" };

// A day-in-progress payload with nothing recorded yet, for tests exercising the submitted-days
// panels rather than the live stand-in.
const emptyToday: DayPayload = {
  date: "2026-08-19", meals: [],
  derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 },
};

// The fixture panels plus a carb-score points panel configured last, mirroring the production
// config where the carbs question follows the single-type questions.
const carbsPanel: Question = {
  id: "carbs", type: "points", text: "פחמימות", panel_qualifier: "ציון",
  choices: [{ id: "no_carbs", label: "ללא פחמימות", value: 0 }],
};
// The same week with a carb score recorded, so the score panel actually plots: one clean day
// whose points stayed within the program and one spent largely on flour and sugar.
const scoredDays: Day[] = [
  { date: "2026-08-17", answers: { drinking: 2, window: 8, carbs: 9 }, excluded: 0 },
  { date: "2026-08-18", answers: { drinking: 3, window: 13, carbs: 14 }, excluded: 10 },
];

const withCarbsPanel: Questionnaire = {
  ...fixtureQuestionnaire,
  questions: [...fixtureQuestionnaire.questions, carbsPanel],
  rules: [...fixtureQuestionnaire.rules,
          { id: "heavy_day", question_id: "carbs", at_least: 12,
            consecutive_days: 2, message: "m {days}" }],
};

describe("TrendChart", () => {
  it("renders one titled panel per chartable question plus the violation legend", () => {
    render(<TrendChart questionnaire={fixtureQuestionnaire} days={days} today={emptyToday} endDate="2026-08-18" treatDay={TREAT_DAY} loadedInMs={0} />);
    expect(screen.getByText("שתיה (ליטרים)")).toBeInTheDocument();
    expect(screen.getByText("חלון אכילה (שעות)")).toBeInTheDocument();
    expect(screen.getByText("חריגה")).toBeInTheDocument();
  });

  it("wraps each panel in a trend-panel container so panels are visually separated", () => {
    const { container } = render(<TrendChart questionnaire={fixtureQuestionnaire} days={days} today={emptyToday} endDate="2026-08-18" treatDay={TREAT_DAY} loadedInMs={0} />);
    expect(container.querySelectorAll(".trend-panel")).toHaveLength(2);
  });

  it("renders the violation legend above the panels", () => {
    const { container } = render(<TrendChart questionnaire={fixtureQuestionnaire} days={days} today={emptyToday} endDate="2026-08-18" treatDay={TREAT_DAY} loadedInMs={0} />);
    const legend = container.querySelector(".trend-legend")!;
    const firstPanel = container.querySelector(".trend-panel")!;
    expect(legend.compareDocumentPosition(firstPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("labels the chart with how long its data took to reach the browser", () => {
    render(<TrendChart questionnaire={fixtureQuestionnaire} days={days} today={emptyToday} endDate="2026-08-18" treatDay={TREAT_DAY} loadedInMs={150} />);
    expect(screen.getByText("טעינה: 150ms")).toBeInTheDocument();
  });

  it("shows no timing label to a viewer the load diagnostics are not meant for", () => {
    render(<TrendChart questionnaire={fixtureQuestionnaire} days={days} today={emptyToday} endDate="2026-08-18" treatDay={TREAT_DAY} loadedInMs={null} />);
    expect(screen.queryByText(/טעינה/)).not.toBeInTheDocument();
  });

  it("renders the panels before any day has been submitted", () => {
    const { container } = render(<TrendChart questionnaire={fixtureQuestionnaire} days={[]} today={emptyToday} endDate="2026-08-19" treatDay={TREAT_DAY} loadedInMs={0} />);
    expect(container.querySelectorAll(".trend-panel")).toHaveLength(2);
  });

  it("charts the carb-score panel first even when it is configured last", () => {
    const { container } = render(<TrendChart questionnaire={withCarbsPanel} days={days} today={emptyToday} endDate="2026-08-18" treatDay={TREAT_DAY} loadedInMs={0} />);
    const titles = [...container.querySelectorAll(".trend-panel-title")].map((el) => el.textContent);
    expect(titles).toEqual(["פחמימות (ציון)(חריגה: מעל 12)קמחים וסוכרים",
                            "שתיה (ליטרים)(חריגה: פחות מ-2.5)", "חלון אכילה (שעות)"]);
  });

  it("shows each ruled panel's configured limit in its title and leaves unruled panels bare", () => {
    const { container } = render(<TrendChart questionnaire={fixtureQuestionnaire} days={days} today={emptyToday} endDate="2026-08-18" treatDay={TREAT_DAY} loadedInMs={0} />);
    const titles = [...container.querySelectorAll(".trend-panel-title")].map((el) => el.textContent);
    expect(titles).toEqual(["שתיה (ליטרים)(חריגה: פחות מ-2.5)", "חלון אכילה (שעות)"]);
  });

  it("charts the excluded part of the score beside it, on the carb panel alone", () => {
    const { container } = render(<TrendChart questionnaire={withCarbsPanel} days={scoredDays} today={emptyToday} endDate="2026-08-18" treatDay={TREAT_DAY} loadedInMs={0} />);
    const linesPerPanel = [...container.querySelectorAll(".trend-panel")]
      .map((panel) => panel.querySelectorAll(".recharts-line").length);
    expect(linesPerPanel).toEqual([2, 1, 1]);
  });

  it("plots the excluded line under the score, never above it", () => {
    // The excluded part is a part of the score, so its line reads as the gap below it: on the
    // clean day it rests on the baseline while the score plots well above.
    const { container } = render(<TrendChart questionnaire={withCarbsPanel} days={scoredDays} today={emptyToday} endDate="2026-08-18" treatDay={TREAT_DAY} loadedInMs={0} />);
    const [excluded, score] = [...container.querySelector(".trend-panel")!
      .querySelectorAll(".recharts-line-curve")]
      .map((curve) => [...curve.getAttribute("d")!.matchAll(/[ML]([\d.]+),([\d.]+)/g)]
        .map(([, , y]) => Number(y)));
    expect(excluded).toHaveLength(score.length);
    // Larger y is lower on screen.
    expect(excluded.every((y, i) => y >= score[i])).toBe(true);
    expect(excluded.some((y, i) => y > score[i])).toBe(true);
  });

  it("frames the treat day's column on the carb panel, naming what it marks", () => {
    const { container } = render(<TrendChart questionnaire={withCarbsPanel} days={days} today={emptyToday} endDate="2026-08-18" treatDay={TREAT_DAY} loadedInMs={0} />);
    const framed = [...container.querySelectorAll(".trend-panel")]
      .map((panel) => panel.querySelectorAll(".trend-treat-day").length);
    expect(framed).toEqual([1, 0, 0]);
    expect(container.querySelector(".trend-treat-day text")).toHaveTextContent("יום פינוק");
  });

  it("frames the column of the day the treat meal is aimed at", () => {
    // The ten days ending 2026-08-19 run from the 10th, so their Friday — the 14th — is the
    // fifth column. The frame must span exactly where that day's score plots.
    const span = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14",
                  "2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18", "2026-08-19"]
      .map((date) => ({ date, answers: { carbs: 9 }, excluded: 0 }));
    const { container } = render(<TrendChart questionnaire={withCarbsPanel} days={span} today={emptyToday} endDate="2026-08-19" treatDay={TREAT_DAY} loadedInMs={0} />);
    const panel = container.querySelector(".trend-panel")!;
    const [left, right] = [...panel.querySelectorAll(".trend-treat-day line")]
      .map((edge) => Number(edge.getAttribute("x1")));
    // The score line's own dots mark where each day plots; the last dot group is that line's.
    const dots = [...panel.querySelectorAll(".recharts-line-dots")].at(-1)!.querySelectorAll("circle");
    const centers = [...dots].map((dot) => Number(dot.getAttribute("cx")));
    expect(centers).toHaveLength(10);
    expect(centers[4]).toBeGreaterThanOrEqual(left);
    expect(centers[4]).toBeLessThanOrEqual(right);
    expect(centers[3]).toBeLessThan(left);
    expect(centers[5]).toBeGreaterThan(right);
  });

  it("colors the treat day's date on the axis green, whichever panel carries the axis", () => {
    // The date row sits under the last panel, which is not the carb panel here.
    const { container } = render(<TrendChart questionnaire={fixtureQuestionnaire} days={days} today={emptyToday} endDate="2026-08-18" treatDay={TREAT_DAY} loadedInMs={0} />);
    const fillOf = (label: string) => [...container.querySelectorAll(".recharts-cartesian-axis-tick-value")]
      .find((tick) => tick.textContent === label)!.getAttribute("fill");
    // 2026-08-14 is the Friday among the charted days.
    expect(fillOf("14.8")).toBe("var(--accent)");
    expect(fillOf("13.8")).toBe("var(--viz-muted)");
  });

  it("frames both treat days when the span ends on one, so the two can be compared", () => {
    // 2026-08-21 is a Friday; the ten days ending on it open two days before the Friday before.
    const { container } = render(<TrendChart questionnaire={withCarbsPanel} days={days} today={emptyToday} endDate="2026-08-21" treatDay={TREAT_DAY} loadedInMs={0} />);
    const framed = [...container.querySelectorAll(".trend-panel")]
      .map((panel) => panel.querySelectorAll(".trend-treat-day").length);
    expect(framed).toEqual([2, 0, 0]);
  });

  it("moves the frame with the week it charts, keeping it on the configured weekday", () => {
    // 2026-08-14 is a Friday: it is the sixth column of the span ending 2026-08-18 and the
    // fifth of the span ending a day later.
    const frameAt = (endDate: string) => {
      const { container } = render(<TrendChart questionnaire={withCarbsPanel} days={days} today={emptyToday} endDate={endDate} treatDay={TREAT_DAY} loadedInMs={0} />);
      return Number(container.querySelector(".trend-treat-day line")!.getAttribute("x1"));
    };
    const [second, first] = [frameAt("2026-08-18"), frameAt("2026-08-19")];
    expect(second).toBeGreaterThan(first);
  });

  it("lays each title row out right-to-left so the limit follows the title in reading order", () => {
    const { container } = render(<TrendChart questionnaire={fixtureQuestionnaire} days={days} today={emptyToday} endDate="2026-08-18" treatDay={TREAT_DAY} loadedInMs={0} />);
    for (const row of container.querySelectorAll(".trend-panel-title")) {
      expect(row.getAttribute("dir")).toBe("rtl");
    }
  });
});
