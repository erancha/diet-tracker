// How much of a carb grade's name the app shows, and the browser-remembered choice of it.
//
// A carbs choice names itself and then lists what it covers, and the config holds the two apart;
// the halves compose only at the expanded density. Eight composed labels — twice over, once the
// second carb source group is open — are a lot for a phone, so the trimmed names-alone reading
// stands one press away for a reader who already knows the grades.

import { useCallback, useState } from "react";
import { readStored, STORAGE_PREFIX, writeStored } from "./localStore";
import type { Choice } from "./types";

// The tracker opens with the examples spelled out; the choice, once trimmed or restored, is the
// browser's to remember. Exported for tests that pin the density a case opens on.
export const STORAGE_KEY = `${STORAGE_PREFIX}expanded-grade-labels`;

/** One choice as it reads at the requested density. Choices carrying no examples — every question
 * outside the carbs grades — read the same either way. */
export function choiceLabel(choice: Choice, expanded: boolean): string {
  if (!expanded || choice.examples === undefined) return choice.label;
  return `${choice.label} (${choice.examples})`;
}

function storedPreference(): boolean {
  return readStored(STORAGE_KEY) !== "false";
}

function storePreference(expanded: boolean): void {
  writeStored(STORAGE_KEY, String(expanded));
}

/** Whether grade labels read in full, and the setter that records the change for next time. */
export function useExpandedGradeLabels(): [boolean, (expanded: boolean) => void] {
  const [expanded, setExpanded] = useState(storedPreference);
  const set = useCallback((next: boolean) => {
    setExpanded(next);
    storePreference(next);
  }, []);
  return [expanded, set];
}
