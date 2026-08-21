import type { Question } from "../types";
import { questionTitle } from "../violations";

// A points question as a range input. The floor (the day's recorded meal-points sum) pins the
// minimum; the configured max caps the scale unless recorded meals already exceed it. Only
// points questions reach this component, and every points question in the config defines max.
export function PointsSlider({ question, value, floor, onChange }: {
  question: Question;
  value: number;
  floor: number;
  onChange: (value: number) => void;
}) {
  const max = Math.max(question.max!, floor);
  return (
    <fieldset>
      <legend title={question.tooltip}>{questionTitle(question, "day")}</legend>
      <div className="points-slider">
        <input
          type="range"
          min={floor}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={questionTitle(question, "day")}
        />
        <output>{value}</output>
      </div>
    </fieldset>
  );
}
