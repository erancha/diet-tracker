import { useEffect, useRef, useState, type CSSProperties } from "react";

// How long an auto-opened panel stands before folding away on its own, unless the caller names
// another hold. The style sheet's wind-down dim reads the hold from the custom property the hook
// hands back, so the dim ends exactly where the fold begins whatever the hold.
export const WIND_DOWN_FOLD_MS = 10_000;

// How long the closing sweep runs — the duration of the style sheet's section-fold animation.
// The collapsed state lands only once the sweep has finished, because collapsing unmounts the
// content the animation needs on screen.
export const WIND_DOWN_SWEEP_MS = 500;

/**
 * Timed fold for a section that opened on its own: a short look, a dim, then a sweep shut, so the
 * exit cannot read as a mistake. `armed` runs the countdown; the section's toggle, set() or
 * disarm() hands the fold to the user for the rest of the visit. `waning` dims the section for
 * the armed stretch, `folding` runs the sweep with the content still mounted, and `collapsed`
 * lands after it; `style` tells the dim how long the hold is. A caller that hands `ref` to its
 * section element also has a press anywhere outside that element fold the armed section at
 * once, since a hand reaching elsewhere on the page has seen what the section opened to show.
 */
export function useWindDownFold(armed: boolean, initiallyCollapsed: boolean,
                                holdMs: number = WIND_DOWN_FOLD_MS) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const [folding, setFolding] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

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

  const waning = armed && !engaged && !collapsed;
  useEffect(() => {
    if (!waning) return;
    const onPress = (event: Event) => {
      const section = ref.current;
      if (section === null || section.contains(event.target as Node)) return;
      set(true);
    };
    document.addEventListener("pointerdown", onPress);
    return () => document.removeEventListener("pointerdown", onPress);
  }, [waning]);

  const style = { "--wind-down-hold": `${holdMs}ms` } as CSSProperties;
  return { collapsed, folding, waning, style, toggle, disarm, set, ref };
}
