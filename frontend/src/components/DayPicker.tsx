import { ddmmLabel } from "../dates";

export type DayChoice = "today" | "yesterday";

interface Props {
  todayStr: string;
  yesterdayStr: string;
  value: DayChoice;
  // Today is answerable only once it has ended; until then the picker holds to yesterday.
  todaySelectable: boolean;
  // Hour today opens at, named in the blocked option's tooltip.
  reminderHour: number;
  onChange: (value: DayChoice) => void;
}

export function DayPicker({ todayStr, yesterdayStr, value, todaySelectable, reminderHour, onChange }: Props) {
  return (
    <div className="day-picker">
      <label>
        <input type="radio" name="day" checked={value === "today"} disabled={!todaySelectable}
               title={todaySelectable ? undefined : `שאלון סוף היום נפתח מ-${reminderHour}:00`}
               onChange={() => onChange("today")} />
        {" "}היום ({ddmmLabel(todayStr)})
      </label>
      <label>
        <input type="radio" name="day" checked={value === "yesterday"} onChange={() => onChange("yesterday")} />
        {" "}אתמול ({ddmmLabel(yesterdayStr)})
      </label>
    </div>
  );
}
