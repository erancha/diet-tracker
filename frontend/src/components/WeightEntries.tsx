import type { WeightEntry } from "../types";
import { weekdayDdmmLabel } from "../dates";
import { deleteWeightPrompt, kgLabel } from "../weight";
import { Icon } from "./Icon";

// The plotted measurements as a list, newest first — the chart's own reading order is oldest
// first, but a reader looking for the entry to remove starts from the most recent.
//
// Deletion is offered at every date, however old. A weight feeds no day score and no rule streak,
// so removing one restates nothing; a measurement logged against the wrong day would otherwise
// have no way out of the chart.
export function WeightEntries({ entries, onDelete }: {
  entries: WeightEntry[];
  onDelete: (date: string) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <ul className="weight-entries">
      {[...entries].reverse().map((entry) => (
        <li key={entry.date}>
          <span className="weight-entry-date">{weekdayDdmmLabel(entry.date)}</span>
          <span className="weight-entry-kg">{kgLabel(entry.kg)} ק״ג</span>
          <button type="button" className="icon-only"
                  aria-label={`מחיקת השקילה של ${entry.date}`}
                  onClick={() => { if (window.confirm(deleteWeightPrompt(entry))) onDelete(entry.date); }}>
            <Icon name="remove" />
          </button>
        </li>
      ))}
    </ul>
  );
}
