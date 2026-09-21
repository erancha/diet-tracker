import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeightChart } from "./WeightChart";
import type { WeightEntry } from "../types";

const series = (...kgs: number[]): WeightEntry[] =>
  kgs.map((kg, i) => ({ date: `2026-08-${String(20 + i).padStart(2, "0")}`, kg, at: null }));

function grounds(): Element[] {
  return [...document.querySelectorAll(".recharts-reference-area-rect")];
}

describe("rising stretches", () => {
  it("grounds each stretch the weight climbed over in the breach tint", () => {
    render(<WeightChart entries={series(80, 81, 80.5, 82)} target={75} span={3} spans={[3]}
                        onSpanChange={() => {}} />);
    expect(grounds().map((rect) => rect.getAttribute("fill")))
      .toEqual(["var(--breach-ground)", "var(--breach-ground)"]);
  });

  it("leaves a descent unmarked", () => {
    render(<WeightChart entries={series(82, 81, 81, 80)} target={75} span={3} spans={[3]}
                        onSpanChange={() => {}} />);
    expect(grounds()).toHaveLength(0);
  });

  it("stretches each ground from the lighter weighing to the heavier one", () => {
    const { container } = render(
      <WeightChart entries={series(80, 81, 81, 82)} target={null} span={3} spans={[3]}
                   onSpanChange={() => {}} />);
    const dots = [...container.querySelectorAll(".recharts-line-dots circle")]
      .map((dot) => Number(dot.getAttribute("cx")));
    const [first, second] = grounds().map((rect) => ({
      x: Number(rect.getAttribute("x")),
      right: Number(rect.getAttribute("x")) + Number(rect.getAttribute("width")),
    }));
    expect(first.x).toBeCloseTo(dots[0]);
    expect(first.right).toBeCloseTo(dots[1]);
    expect(second.x).toBeCloseTo(dots[2]);
    expect(second.right).toBeCloseTo(dots[3]);
  });
});
