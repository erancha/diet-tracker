import { useEffect, useRef, useState } from "react";
import type { ChartSpan, WeightPayload, WeightSettings } from "../types";
import { isWeighInDay, isoDate } from "../dates";
import { mayDiscardEdits } from "../edits";
import { activeSpan, ceilingWarning, entriesWithin, floorWarning, kgLabel, offeredSpans, parseKg,
         rhythmReading, summarize, targetChangePrompt, trendShape, WEIGH_IN_CADENCE_QUESTION,
         type TrendShape, type WeightSummary } from "../weight";
import { CollapsibleSection } from "./CollapsibleSection";
import { Icon, type IconName } from "./Icon";
import { useGlobalFold } from "./useFoldAll";
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

// What follows the weight on the section's one line: how far it sits from the target, and the
// control that sets it. The weight itself heads the section, so it is not repeated here. The line
// already names the target to say how far away the weight is, so that word carries the control
// and the value beside it — the section spends no row on a value revised a few times a year. The
// prefix letter (מעל ה… / מתחת ל… / ב…) stays outside the control, so the clickable word is the
// same token in every reading.
//
// A target that has never been set opens the editor itself: unset, the control is one word in a
// header line, easy to walk past on the way to the weighing input below it — and a weighing with
// no target behind it charts nothing to aim at.
//
// The check mark stands only once the input reads a different weight from the standing target,
// so there is nothing to commit that would change nothing. Committing asks for confirmation —
// replacing a standing target is not the same act as discarding an untouched draft. Closing on a
// value that was actually typed raises the discard guard the forms elsewhere share; an untouched
// input closes silently.
//
// A close glyph stands beside the input only while it holds a value. An empty input, the state a
// never-set target opens in, closes instead on a press anywhere outside the line: the editor was
// opened for the reader rather than by them, so carrying on with the page dismisses it.
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

// Today's weighing. The row marks itself on the weigh-in day, which is what the stylesheet sizes
// it by: the day the rhythm asks for a weighing reads larger, and recording stays open on any.
function TodayRow({ recorded, limits, due, onRecord }: {
  recorded: number | null; limits: Limits; due: boolean; onRecord: (kg: number) => void;
}) {
  const draft = useKgDraft(limits);
  const kg = draft.kg;
  return (
    <p className={due ? "weight-today weigh-in-due" : "weight-today"}>
      <span>המשקל היום:</span>
      <KgInput value={draft.text} warning={draft.warning} limits={limits} label="המשקל היום"
               onChange={draft.set} />
      <button type="button" className="primary" disabled={kg === null}
              onClick={() => draft.submit(kg!, onRecord)}>
        {recorded === null ? "שמירה" : "עדכון"}
      </button>
      {recorded !== null && <span className="weight-recorded">נרשם: {kgLabel(recorded)} ק״ג</span>}
    </p>
  );
}

// The weight log's whole surface: today's weighing, the chart, and the measurements behind it,
// under one line opening the page above the day tracker. That line is the section's own heading —
// the latest weight, which is what the reader came for, doubling as the control that opens the
// rest — followed by the distance to the target, the control that sets it, and a framed button
// opening the same fold the heading does. All of it sits outside the fold, which is where the
// section normally rests: weight moves weekly while the tracker below it moves through the day,
// so the line reports and the rest opens on demand, with the target settable either way. Whether
// that resting fold is the right one for the account is the caller's reading, not this section's;
// a section the caller opened stands until a toggle or the menu's global fold closes it. Saving a
// weighing leaves it open: the chart is what the new measurement is worth reading against.
//
// The rhythm line above the chart carries the one word that opens the chat, so a reader who wonders
// why the weighing is weekly can ask without leaving the section.
export function WeightSection({ weight, settings, now, defaultExpanded,
                                onRecord, onSetTarget, onDelete, onAskChat }: {
  weight: WeightPayload;
  settings: WeightSettings;
  now: Date;
  defaultExpanded: boolean;
  onRecord: (kg: number) => void;
  onSetTarget: (kg: number) => void;
  onDelete: (date: string) => void;
  // Absent where the deployment configures no answering service.
  onAskChat?: (question: string) => void;
}) {
  const [span, setSpan] = useState<ChartSpan>(settings.chart_months);
  const [collapsed, setCollapsed] = useState(!defaultExpanded);
  useGlobalFold(setCollapsed);
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
  const rhythm = rhythmReading(weight.entries, settings.weigh_in.weekday, now);
  const shape = trendShape(weight.entries);
  const spans = offeredSpans(weight.entries, now);
  const active = activeSpan(spans, span);
  const plotted = entriesWithin(weight.entries, active, now);

  return (
    <CollapsibleSection
      title={heading}
      collapsed={collapsed}
      onToggle={() => setCollapsed((c) => !c)}
      label={figure === null ? "משקל" : `משקל: ${figure} ${unit}`}
      className={summary.overTarget ? "weight weight-over-target" : "weight"}
      headerAside={
        <>
          <TargetReading summary={summary} limits={settings.limits} onSet={onSetTarget} />
          {/* The heading is a weight reading, so nothing on the folded line looks like a control
              that opens the chart. This one does the same job in a framed button, and its glyph
              draws the last three weighings, so the folded line carries the direction the chart
              behind it would show. */}
          <button type="button" className="glyph weight-chart-toggle" aria-expanded={!collapsed}
                  aria-label="גרף המשקל" onClick={() => setCollapsed((c) => !c)}>
            <Icon name={shape === null ? "trend" : TREND_ICONS[shape]} />
          </button>
        </>
      }
    >
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
                due={isWeighInDay(now, settings.weigh_in.weekday)}
                onRecord={onRecord} />
      {weight.entries.length > 0 && (
        <WeightChart entries={plotted} target={weight.target} span={active} spans={spans}
                     onSpanChange={setSpan} />
      )}
      <WeightEntries entries={plotted} target={weight.target} onDelete={onDelete} />
    </CollapsibleSection>
  );
}
