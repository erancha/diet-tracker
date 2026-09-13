import { useEffect, useState, type CSSProperties } from "react";

/**
 * A value shown in full for a moment — a just-picked grade's list, a meal's named markers — then
 * withdrawn. Each reveal names its own length and restarts the moment, even of the value already
 * showing. The style carries the same length to the highlight's fade, so the flash and the text
 * leave together.
 */
export function useReveal<T>(): {
  revealed: T | null;
  reveal: (value: T, ms: number) => void;
  style: CSSProperties;
} {
  // A fresh object per reveal, so a repeat of the same value is a new state and restarts the timer.
  const [current, setCurrent] = useState<{ value: T; ms: number } | null>(null);
  useEffect(() => {
    if (current === null) return;
    const timer = setTimeout(() => setCurrent(null), current.ms);
    return () => clearTimeout(timer);
  }, [current]);
  return {
    revealed: current === null ? null : current.value,
    reveal: (value, ms) => setCurrent({ value, ms }),
    style: current === null ? {} : { animationDuration: `${current.ms}ms` },
  };
}
