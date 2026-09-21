import { useEffect, useState, type CSSProperties } from "react";

// How long an auto-opened panel stands before folding away on its own, unless the caller names
// another hold. The style sheet's wind-down dim reads the hold from the custom property the hook
// hands back, so the dim ends exactly where the fold begins whatever the hold.
export const WIND_DOWN_FOLD_MS = 10_000;

// How long the closing sweep runs — the duration of the style sheet's section-fold animation.
// The collapsed state lands only once the sweep has finished, because collapsing unmounts the
// content the animation needs on screen.
export const WIND_DOWN_SWEEP_MS = 800;

/**
 * Timed wind-down fold for a section that opened on its own initiative: full presence for a
 * short look, a dim through the back seconds, then a sweep shut — gradual so the exit cannot
 * read as a mistake.
 *
 * `armed` says the open section is unbidden and the countdown should run; any engagement — the
 * section's own toggle, a state the caller imposes through set(), or the caller reporting one
 * through disarm() — hands the fold to the user for the rest of the visit. The caller renders
 * the three readings with the style sheet's section-fold classes: `waning` dresses the section
 * for the whole armed stretch (the dim animation carries its own delay), `folding` runs the
 * closing sweep with the content still mounted, and `collapsed` lands once the sweep is done.
 * `style` goes on the section so the dim knows the hold; `holdMs` is how long the section stands
 * before the sweep starts.
 */
export function useWindDownFold(armed: boolean, initiallyCollapsed: boolean,
                                holdMs: number = WIND_DOWN_FOLD_MS) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const [folding, setFolding] = useState(false);
  const [engaged, setEngaged] = useState(false);

  const toggle = () => {
    setEngaged(true);
    setFolding(false);
    setCollapsed((c) => !c);
  };
  const disarm = () => {
    setEngaged(true);
    setFolding(false);
  };
  // An imposed state — the menu's global fold — engages like the section's own toggle does.
  const set = (next: boolean) => {
    setEngaged(true);
    setFolding(false);
    setCollapsed(next);
  };

  useEffect(() => {
    if (!armed || engaged || collapsed) return;
    const fold = setTimeout(() => setFolding(true), holdMs);
    const folded = setTimeout(() => { setFolding(false); setCollapsed(true); },
                              holdMs + WIND_DOWN_SWEEP_MS);
    return () => { clearTimeout(fold); clearTimeout(folded); };
  }, [armed, engaged, collapsed, holdMs]);

  const style = { "--wind-down-hold": `${holdMs}ms` } as CSSProperties;
  return { collapsed, folding, waning: armed && !engaged && !collapsed, style, toggle, disarm, set };
}
