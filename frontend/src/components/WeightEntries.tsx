import type { WeightEntry } from "../types";
import { ddmmLabel, weekdayLabel } from "../dates";
import { deleteWeightPrompt, kgLabel, overTargetSeverity, risingEdges } from "../weight";
import { Icon } from "./Icon";

// The plotted weighings as a list, newest first, since a reader looking for one to remove starts
// from the latest. Each value is colored against the target like the section heading, and both
// ends of a climb stand on the breach ground the chart lays under it. Deletion is offered at
// every date: a weight feeds no day score, so removing one restates nothing.
export function WeightEntries({ entries, target, onDelete }: {
  entries: WeightEntry[];
  target: number | null;
  onDelete: (date: string) => void;
}) {
  if (entries.length === 0) return null;
  const gained = new Set(risingEdges(entries).flatMap((edge) => [edge.from, edge.to]));
  return (
    <ul className="weight-entries">
      {[...entries].reverse().map((entry) => {
        const severity = overTargetSeverity(entry.kg, target);
        return (
        <li key={entry.date} className={gained.has(entry.date) ? "weight-entry-gain" : undefined}>
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
