import { useEffect, useState } from "react";

// How long an auto-opened panel stands before folding away on its own. The style sheet's
// wind-down dim is timed to end exactly here, so the dim and the fold read as one gesture.
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
 * section's own toggle, or the caller reporting one through disarm() — hands the fold to the
 * user for the rest of the visit. The caller renders the three readings with the style sheet's
 * section-fold classes: `waning` dresses the section for the whole armed stretch (the dim
 * animation carries its own delay), `folding` runs the closing sweep with the content still
 * mounted, and `collapsed` lands once the sweep is done.
 */
export function useWindDownFold(armed: boolean, initiallyCollapsed: boolean) {
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

  useEffect(() => {
    if (!armed || engaged || collapsed) return;
    const fold = setTimeout(() => setFolding(true), WIND_DOWN_FOLD_MS);
    const folded = setTimeout(() => { setFolding(false); setCollapsed(true); },
                              WIND_DOWN_FOLD_MS + WIND_DOWN_SWEEP_MS);
    return () => { clearTimeout(fold); clearTimeout(folded); };
  }, [armed, engaged, collapsed]);

  return { collapsed, folding, waning: armed && !engaged && !collapsed, toggle, disarm };
}
