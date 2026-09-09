import type { WeightEntry } from "../types";
import { ddmmLabel, weekdayLabel } from "../dates";
import { deleteWeightPrompt, kgLabel, overTargetSeverity } from "../weight";
import { Icon } from "./Icon";

// The plotted measurements as a list, newest first — the chart's own reading order is oldest
// first, but a reader looking for the entry to remove starts from the most recent. Each row
// carries the hour it was weighed at, which is what makes a weekly rhythm legible; a weighing
// recorded before the time was kept holds a dash, keeping the columns aligned. Each value is read
// against the target the way the section's heading is — the colour lands on the number alone,
// leaving the unit as chrome. The weekday and the value each carry their own span so the
// stylesheet can pad them to a common width, which is what holds the columns straight.
//
// Deletion is offered at every date, however old. A weight feeds no day score and no rule streak,
// so removing one restates nothing; a measurement logged against the wrong day would otherwise
// have no way out of the chart.
export function WeightEntries({ entries, target, onDelete }: {
  entries: WeightEntry[];
  target: number | null;
  onDelete: (date: string) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <ul className="weight-entries">
      {[...entries].reverse().map((entry) => {
        const severity = overTargetSeverity(entry.kg, target);
        return (
        <li key={entry.date}>
          <span className="weight-entry-date">
            <span className="weight-entry-weekday">{weekdayLabel(entry.date)}</span>
            {" "}{ddmmLabel(entry.date)}
          </span>
          <span className="weight-entry-at">{entry.at === null ? "—" : entry.at}</span>
          <span className="weight-entry-kg">
            <span className={severity === null ? "weight-entry-value"
              : severity === "far" ? "weight-entry-value over-target far-over"
              : "weight-entry-value over-target"}>
              {kgLabel(entry.kg)}
            </span> ק״ג
          </span>
          <button type="button" className="glyph"
                  aria-label={`מחיקת השקילה של ${entry.date}`}
                  onClick={() => { if (window.confirm(deleteWeightPrompt(entry))) onDelete(entry.date); }}>
            <Icon name="remove" />
          </button>
        </li>
        );
      })}
    </ul>
  );
}
