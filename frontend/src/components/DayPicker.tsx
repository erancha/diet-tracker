export type DayChoice = "today" | "yesterday";

interface Props {
  todayStr: string;
  yesterdayStr: string;
  value: DayChoice;
  onChange: (value: DayChoice) => void;
}

export function DayPicker({ todayStr, yesterdayStr, value, onChange }: Props) {
  return (
    <div className="day-picker">
      <label>
        <input type="radio" name="day" checked={value === "today"} onChange={() => onChange("today")} />
        {" "}היום ({todayStr})
      </label>
      <label>
        <input type="radio" name="day" checked={value === "yesterday"} onChange={() => onChange("yesterday")} />
        {" "}אתמול ({yesterdayStr})
      </label>
    </div>
  );
}
