import { useEffect, useState } from "react";

// How long the page rests after settling before the target line starts flashing, so the flash
// lands on a page the eye has already taken in rather than on the loading transition.
export const TARGET_FLASH_DELAY_MS = 3_000;

// How long the weight section's target line flashes for an account without a target weight,
// once per page opening. The first-visit intro's closing target flash fills the same stretch,
// so every unset account sees one flash of one length; the style sheet's iteration count fills
// it exactly.
export const TARGET_FLASH_MS = 7_000;

type Phase = "resting" | "flashing" | "done";

/**
 * One-shot nag toward setting a target weight: rests for the delay after activation, flashes
 * for the target stretch, then stays dark for the rest of the page's life. Never true while
 * inactive.
 */
export function useTargetUnsetFlash(active: boolean): boolean {
  const [phase, setPhase] = useState<Phase>("resting");

  useEffect(() => {
    if (!active || phase === "done") return;
    const [next, holdMs]: [Phase, number] = phase === "resting"
      ? ["flashing", TARGET_FLASH_DELAY_MS] : ["done", TARGET_FLASH_MS];
    const timer = setTimeout(() => setPhase(next), holdMs);
    return () => clearTimeout(timer);
  }, [active, phase]);

  return active && phase === "flashing";
}
