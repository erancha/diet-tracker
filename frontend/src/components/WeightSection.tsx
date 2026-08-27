import { useState } from "react";
import type { ChartSpan, WeightPayload, WeightSettings } from "../types";
import { isoDate } from "../dates";
import { mayDiscardEdits } from "../edits";
import { activeSpan, entriesWithin, kgLabel, offeredSpans, parseKg, summarize, targetChangePrompt, type WeightSummary } from "../weight";
import { CollapsibleSection } from "./CollapsibleSection";
import { Icon } from "./Icon";
import { WeightChart } from "./WeightChart";
import { WeightEntries } from "./WeightEntries";

interface Limits {
  min_kg: number;
  max_kg: number;
}

function KgInput({ value, limits, label, onChange }: {
  value: string; limits: Limits; label: string; onChange: (value: string) => void;
}) {
  return (
    <input type="number" inputMode="decimal" step="0.1" aria-label={label}
           min={limits.min_kg} max={limits.max_kg} value={value}
           onChange={(e) => onChange(e.target.value)} />
  );
}

// What follows the weight on the section's one line: how far it sits from the target, and the
// control that sets it. The weight itself heads the section, so it is not repeated here. The line
// already names the target to say how far away the weight is, so that word carries the control
// and the value beside it — the section spends no row on a value revised a few times a year. The
// prefix letter (מעל ה… / מתחת ל… / ב…) stays outside the control, so the clickable word is the
// same token in every reading.
//
// Committing asks for confirmation — replacing a standing target is not the same act as
// discarding an untouched draft. Closing on a value that was actually typed raises the discard
// guard the forms elsewhere share; an untouched input closes silently.
function TargetReading({ summary, limits, onSet }: {
  summary: WeightSummary; limits: Limits; onSet: (kg: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const opensOn = summary.target === null ? "" : String(summary.target);
  const kg = editing ? parseKg(draft, limits) : null;

  const commit = () => {
    if (kg === null) return;
    if (window.confirm(targetChangePrompt(kg))) {
      onSet(kg);
      setDraft(null);
    }
  };

  const toggle = () => {
    if (!editing) return setDraft(opensOn);
    if (mayDiscardEdits(draft !== opensOn)) setDraft(null);
  };

  return (
    <span className="weight-summary">
      {summary.latest !== null && <>· </>}
      {summary.gapKg !== null && <><span className="value weight-gap">{kgLabel(summary.gapKg)}</span>{" "}</>}
      {summary.prefix}
      <button type="button" className="weight-target-toggle" aria-expanded={editing}
              aria-label="עריכת יעד" onClick={toggle}>יעד</button>:{" "}
      {editing ? (
        <>
          <KgInput value={draft} limits={limits} label="משקל יעד" onChange={setDraft} />
          <button type="button" className="icon-only weight-target-commit" aria-label="אישור"
                  disabled={kg === null} onClick={commit}><Icon name="check" /></button>
        </>
      ) : summary.target === null ? (
        <span className="weight-target-unset">טרם נקבע</span>
      ) : (
        <><span className="value">{kgLabel(summary.target)}</span> ק״ג</>
      )}
    </span>
  );
}

function TodayRow({ recorded, limits, onRecord }: {
  recorded: number | null; limits: Limits; onRecord: (kg: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const kg = parseKg(draft, limits);
  return (
    <p className="weight-today">
      <span>המשקל היום:</span>
      <KgInput value={draft} limits={limits} label="המשקל היום" onChange={setDraft} />
      <button type="button" disabled={kg === null}
              onClick={() => { onRecord(kg!); setDraft(""); }}>
        {recorded === null ? "שמירה" : "עדכון"}
      </button>
      {recorded !== null && <span className="weight-recorded">נרשם: {kgLabel(recorded)} ק״ג</span>}
    </p>
  );
}

// The weight log's whole surface: today's weighing, the chart, and the measurements behind it,
// under one line opening the page above the day tracker. That line is the section's own heading —
// the latest weight, which is what the reader came for, doubling as the control that opens the
// rest — followed by the distance to the target and the control that sets it. Both sit outside
// the fold, which is where the section rests: weight moves weekly while the tracker below it
// moves through the day, so the line reports and the rest opens on demand, with the target
// settable either way.
export function WeightSection({ weight, settings, now, onRecord, onSetTarget, onDelete }: {
  weight: WeightPayload;
  settings: WeightSettings;
  now: Date;
  onRecord: (kg: number) => void;
  onSetTarget: (kg: number) => void;
  onDelete: (date: string) => void;
}) {
  const [span, setSpan] = useState<ChartSpan>(settings.chart_months);
  const todayStr = isoDate(now);
  const recordedToday = weight.entries.find((entry) => entry.date === todayStr);
  const summary = summarize(weight.entries, weight.target);
  // Nothing weighed yet leaves no value to head the section with, so it falls back to its name.
  const figure = summary.latest === null ? null : kgLabel(summary.latest);
  const unit = "ק״ג";
  // The figure is held apart from its unit so that over target the colour lands on the number
  // alone, as it does on the distance beside it; the accessible name needs the two as one string.
  const heading = figure === null
    ? "משקל"
    : <><span className="weight-latest">{figure}</span> {unit}</>;
  const spans = offeredSpans(weight.entries, now);
  const active = activeSpan(spans, span);
  const plotted = entriesWithin(weight.entries, active, now);

  return (
    <CollapsibleSection
      title={heading}
      defaultCollapsed
      label={figure === null ? "משקל" : `משקל: ${figure} ${unit}`}
      className={summary.overTarget ? "weight weight-over-target" : "weight"}
      headerAside={<TargetReading summary={summary} limits={settings.limits} onSet={onSetTarget} />}
    >
      <TodayRow recorded={recordedToday?.kg ?? null} limits={settings.limits} onRecord={onRecord} />
      {weight.entries.length > 0 && (
        <WeightChart entries={plotted} target={weight.target} span={active} spans={spans}
                     onSpanChange={setSpan} />
      )}
      <WeightEntries entries={plotted} onDelete={onDelete} />
    </CollapsibleSection>
  );
}
