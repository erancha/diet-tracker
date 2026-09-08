import { useEffect, useState } from "react";
import { TARGET_FLASH_MS } from "./useTargetUnsetFlash";

// The banner's three sentences in turn, the target-weight line, a quiet rest, and then the
// standing add-meal invitation; "meal" is terminal.
export type IntroStage = 0 | 1 | 2 | 3 | "rest" | "meal";

// How long each flashed stage holds. The opening sentence and the closing target flash press
// longer than the middle sentences' beats: the first sentence names the very action the target
// flash lands on, and the closing stretch is the same target flash every unset account gets.
export const INTRO_STAGE_MS: Record<0 | 1 | 2 | 3, number> = {
  0: 3_000, 1: 2_000, 2: 2_000, 3: TARGET_FLASH_MS,
};

// When, measured from the page opening, the add-meal toggle starts inviting — well clear of the
// flashes above, so the weighing keeps the first word.
export const MEAL_NUDGE_AT_MS = 30_000;

const FLASHES_TOTAL_MS = Object.values(INTRO_STAGE_MS).reduce((sum, ms) => sum + ms, 0);

/**
 * One-shot first-visit intro: flashes the welcome banner's sentences one after the other, folds
 * the banner, flashes the weight section's target line, rests quietly, and finally settles on a
 * standing add-meal invitation. Returns the stage the intro stands on, or null while inactive.
 */
export function useWelcomeIntro(active: boolean): IntroStage | null {
  const [stage, setStage] = useState<IntroStage>(0);

  useEffect(() => {
    if (!active || stage === "meal") return;
    const [next, holdMs]: [IntroStage, number] = stage === "rest"
      ? ["meal", MEAL_NUDGE_AT_MS - FLASHES_TOTAL_MS]
      : [stage === 3 ? "rest" : ((stage + 1) as IntroStage), INTRO_STAGE_MS[stage]];
    const timer = setTimeout(() => setStage(next), holdMs);
    return () => clearTimeout(timer);
  }, [active, stage]);

  return active ? stage : null;
}
