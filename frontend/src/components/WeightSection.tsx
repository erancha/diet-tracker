import { useEffect, useRef, useState } from "react";
import type { ChartSpan, WeightPayload, WeightSettings } from "../types";
import { isWeighInDay, isoDate } from "../dates";
import { mayDiscardEdits } from "../edits";
import { activeSpan, ceilingWarning, entriesWithin, floorWarning, kgLabel, offDayWeighingHint,
         offeredSpans, parseKg, rhythmReading, summarize, targetChangePrompt, trendShape,
         WEIGH_IN_CADENCE_QUESTION, type TrendShape, type WeightSummary } from "../weight";
import { CollapsibleSection } from "./CollapsibleSection";
import { Icon, type IconName } from "./Icon";
import { useGlobalFold } from "./useFoldAll";
import { useWindDownFold } from "./useWindDownFold";
import { WeightChart } from "./WeightChart";
import { WeightEntries } from "./WeightEntries";

interface Limits {
  min_kg: number;
  max_kg: number;
}

// One weight input's text and the warning standing beside it. The ceiling warns as the figure is
// typed; the floor is read only when the figure is submitted, and its warning stands until the
// text moves again. A figure past the ceiling parses to nothing, which is what disables the
// submit beside the input.
function useKgDraft(limits: Limits) {
  const [text, setText] = useState("");
  const [floorNotice, setFloorNotice] = useState<string | null>(null);
  const kg = parseKg(text, limits);
  const set = (next: string) => {
    setText(next);
    setFloorNotice(null);
  };
  const submit = (kg: number, act: (kg: number) => void) => {
    const notice = floorWarning(kg, limits);
    if (notice === null) act(kg); else setFloorNotice(notice);
  };
  return { text, set, kg, warning: ceilingWarning(text, limits) ?? floorNotice, submit };
}

function KgInput({ value, warning, limits, label, onChange }: {
  value: string; warning: string | null; limits: Limits; label: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <input type="number" inputMode="decimal" step="0.1" aria-label={label}
             min={limits.min_kg} max={limits.max_kg} value={value} aria-invalid={warning !== null}
             onChange={(e) => onChange(e.target.value)} />
      {warning !== null && <> <span className="weight-limit-warning" role="alert">{warning}</span></>}
    </>
  );
}

// The header line's tail after the weight: its distance from the target, and the word "יעד",
// which opens the target editor — no row is spent on a value revised a few times a year. An unset
// target opens the editor on mount, and while empty the editor closes on any press outside the
// line. Committing a changed value asks for confirmation; closing over a typed value raises the
// shared discard guard.
function TargetReading({ summary, limits, onSet }: {
  summary: WeightSummary; limits: Limits; onSet: (kg: number) => void;
}) {
  const [editing, setEditing] = useState(summary.target === null);
  const draft = useKgDraft(limits);
  const opensOn = summary.target === null ? "" : String(summary.target);
  const kg = editing ? draft.kg : null;
  const changed = kg !== summary.target;
  const line = useRef<HTMLSpanElement>(null);

  const commit = () => {
    if (kg === null) return;
    draft.submit(kg, (kg) => {
      if (window.confirm(targetChangePrompt(kg, summary.target))) {
        onSet(kg);
        setEditing(false);
      }
    });
  };

  const open = () => {
    draft.set(opensOn);
    setEditing(true);
  };

  const close = () => {
    if (mayDiscardEdits(draft.text !== opensOn)) setEditing(false);
  };

  const toggle = () => (editing ? close() : open());

  const dismissOnOutsidePress = editing && draft.text === "";
  useEffect(() => {
    if (!dismissOnOutsidePress) return;
    const dismiss = (event: MouseEvent) => {
      if (!line.current?.contains(event.target as Node)) setEditing(false);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [dismissOnOutsidePress]);

  return (
    <span className="weight-summary" ref={line}>
      {summary.latest !== null && <>· </>}
      {summary.gapKg !== null && <><span className="value weight-gap">{kgLabel(summary.gapKg)}</span>{" "}</>}
      {summary.prefix}
      <button type="button" className="disclosure in-text" aria-expanded={editing}
              aria-label="עריכת יעד" onClick={toggle}>יעד</button>
      {editing ? (
        <>
          :{" "}
          <KgInput value={draft.text} warning={draft.warning} limits={limits} label="משקל יעד"
                   onChange={draft.set} />
          {changed && (
            <button type="button" className="glyph compact weight-target-commit" aria-label="אישור"
                    disabled={kg === null} onClick={commit}><Icon name="check" /></button>
          )}
          {draft.text !== "" && (
            <button type="button" className="glyph compact weight-target-close"
                    aria-label="סגירת עריכת היעד" onClick={close}><Icon name="close" /></button>
          )}
        </>
      ) : (
        <>
          {" "}
          {/* A second handle on the same fold for the pointer alone: the underlined word beside
              it is the control assistive technology and the keyboard reach. */}
          <button type="button" tabIndex={-1} aria-hidden="true" onClick={toggle}>
            {summary.target === null
              ? <>(<span className="weight-target-unset">טרם נקבע</span>)</>
              : <>(<span className="value">{kgLabel(summary.target)}</span> ק״ג)</>}
          </button>
        </>
      )}
    </span>
  );
}

// The glyph the chart button wears for each shape the last three weighings draw. Before a second
// weighing there is no direction to draw, and the button falls back to a plain chart.
const TREND_ICONS: Record<TrendShape, IconName> = {
  down: "trendDown",
  flat: "trendFlat",
  up: "trendUp",
  peak: "trendPeak",
  valley: "trendValley",
};

// How long the glance holds the section open before it folds itself away: enough to take in the
// chart's newest stretch, short enough that the tracker below is not kept waiting.
export const WEIGHT_GLANCE_MS = 2_500;

// Today's weighing. The row marks itself on the weigh-in day, which is what the stylesheet sizes
// it by: the day the rhythm asks for a weighing reads larger. Recording stays open on any day; off
// the weigh-in day, the row says so as soon as a figure is being typed, rather than after it is
// saved. A recorded weight empties the input, since the saved value reads beside it.
function TodayRow({ recorded, limits, weighInWeekday, due, onRecord }: {
  recorded: number | null; limits: Limits; weighInWeekday: string; due: boolean;
  onRecord: (kg: number) => void;
}) {
  const draft = useKgDraft(limits);
  const kg = draft.kg;
  const record = (kg: number) => {
    onRecord(kg);
    draft.set("");
  };
  return (
    <p className={due ? "weight-today weigh-in-due" : "weight-today"}>
      <span>המשקל היום:</span>
      <KgInput value={draft.text} warning={draft.warning} limits={limits} label="המשקל היום"
               onChange={draft.set} />
      <button type="button" className="primary" disabled={kg === null}
              onClick={() => draft.submit(kg!, record)}>
        {recorded === null ? "שמירה" : "עדכון"}
      </button>
      {recorded !== null && <span className="weight-recorded">נרשם: {kgLabel(recorded)} ק״ג</span>}
      {draft.text !== "" && !due && (
        <span className="notice weight-off-day">{offDayWeighingHint(weighInWeekday)}</span>
      )}
    </p>
  );
}

// The weight log: today's weighing, the chart and the measurements, folded under one header line
// carrying the latest weight (the fold's toggle), the target reading and a chart button. Weight
// moves weekly, so the section normally rests folded; the caller decides when it opens. A glance
// opens it for a few seconds on a gain, then folds it unless a toggle, the menu's fold or a saved
// weighing took it over.
export function WeightSection({ weight, settings, weighInWeekday, now, defaultExpanded, glance,
                                onRecord, onSetTarget, onDelete, onAskChat }: {
  weight: WeightPayload;
  settings: WeightSettings;
  // The treat day's weekday, which the weigh-in falls on.
  weighInWeekday: string;
  now: Date;
  defaultExpanded: boolean;
  // Opens the section for the glance; a section opened by defaultExpanded stands regardless.
  glance: boolean;
  onRecord: (kg: number) => void;
  onSetTarget: (kg: number) => void;
  onDelete: (date: string) => void;
  // Absent where the deployment configures no answering service.
  onAskChat?: (question: string) => void;
}) {
  const [span, setSpan] = useState<ChartSpan>(settings.chart_months);
  const fold = useWindDownFold(glance && !defaultExpanded, !(defaultExpanded || glance),
                               WEIGHT_GLANCE_MS);
  useGlobalFold(fold.set);
  const collapsed = fold.collapsed;
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
  // The rhythm reads inside the fold rather than on the header line: the phone-width line already
  // carries the weight and the target, and the one morning the reading is urgent is the morning
  // the caller opens the section anyway.
  const rhythm = rhythmReading(weight.entries, weighInWeekday, now);
  const shape = trendShape(weight.entries);
  const spans = offeredSpans(weight.entries, now);
  const active = activeSpan(spans, span);
  const plotted = entriesWithin(weight.entries, active, now);

  return (
    <CollapsibleSection
      title={heading}
      collapsed={collapsed}
      onToggle={fold.toggle}
      label={figure === null ? "משקל" : `משקל: ${figure} ${unit}`}
      className={["weight", summary.overTarget && "weight-over-target", fold.waning && "section-waning"]
        .filter(Boolean).join(" ")}
      style={fold.style}
      headerAside={
        <>
          <TargetReading summary={summary} limits={settings.limits} onSet={onSetTarget} />
          {/* The heading is a weight reading, so nothing on the folded line looks like a control
              that opens the chart. This one does the same job in a framed button, and its glyph
              draws the last three weighings, so the folded line carries the direction the chart
              behind it would show. */}
          <button type="button" className="glyph weight-chart-toggle" aria-expanded={!collapsed}
                  aria-label="גרף המשקל" onClick={fold.toggle}>
            <Icon name={shape === null ? "trend" : TREND_ICONS[shape]} />
          </button>
        </>
      }
    >
      <div className={fold.folding ? "section-fold-body section-folding" : "section-fold-body"}>
      <div>
      {rhythm !== null && (
        <p className="weight-rhythm">
          {rhythm.before}
          {/* The linked words sit mid-sentence, so with nothing to ask they read as plain text. */}
          {onAskChat === undefined ? rhythm.linked : rhythm.linked !== "" && (
            <button type="button" onClick={() => onAskChat(WEIGH_IN_CADENCE_QUESTION)}>
              {rhythm.linked}
            </button>
          )}
          {rhythm.after}
        </p>
      )}
      <TodayRow recorded={recordedToday?.kg ?? null} limits={settings.limits}
                weighInWeekday={weighInWeekday} due={isWeighInDay(now, weighInWeekday)}
                onRecord={(kg) => { fold.disarm(); onRecord(kg); }} />
      {weight.entries.length > 0 && (
        <WeightChart entries={plotted} target={weight.target} span={active} spans={spans}
                     onSpanChange={setSpan} />
      )}
      <WeightEntries entries={plotted} target={weight.target} onDelete={onDelete} />
      </div>
      </div>
    </CollapsibleSection>
  );
}
