import { createContext, useContext, useEffect, useRef } from "react";

// One step of the menu's global fold broadcast: `gen` counts issued commands so a consumer can
// tell a fresh command from a re-render, `collapsed` is the state every section is told to take.
export type FoldAllCommand = { gen: number; collapsed: boolean };

// Generation zero is the no-command-yet state, so a section rendered outside any provider —
// component tests included — never moves.
export const FoldAllContext = createContext<FoldAllCommand>({ gen: 0, collapsed: false });

// The menu item alternates: each press sweeps in the direction opposite the previous press.
export const advanceFoldAll = ({ gen, collapsed }: FoldAllCommand): FoldAllCommand =>
  ({ gen: gen + 1, collapsed: !collapsed });

// Applies each newly issued command to one section's collapsed state, then hands that state back
// to its owner: a section toggled by hand afterwards must stay where the hand put it, so the
// effect keys on the generation instead of re-asserting the command's state on every render.
export function useFoldAllEffect(command: FoldAllCommand,
                                 setCollapsed: (collapsed: boolean) => void) {
  const applied = useRef(0);
  useEffect(() => {
    if (command.gen === applied.current) return;
    applied.current = command.gen;
    setCollapsed(command.collapsed);
  });
}

// Consumer-side binding for sections below the provider: subscribe with the section's own setter.
export function useGlobalFold(setCollapsed: (collapsed: boolean) => void) {
  useFoldAllEffect(useContext(FoldAllContext), setCollapsed);
}
