import { useEffect, useRef } from "react";

export interface AlertItem {
  kind: "alert" | "ok";
  message: string;
}

// A batch of nothing but successes clears itself after this long. A batch carrying a failure or a
// violation stays until the next action replaces it: those are read at the user's pace.
const OK_DISMISS_MS = 5000;

// The screen's one message strip — every action reports here. It sits above a page tall enough to
// push it off screen, so a fresh batch scrolls itself into view instead of waiting to be found.
export function Alerts({ items, onDismiss }: { items: AlertItem[]; onDismiss: () => void }) {
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (items.length === 0) return;
    strip.current!.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (items.some((item) => item.kind === "alert")) return;
    const timer = setTimeout(onDismiss, OK_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [items, onDismiss]);

  return (
    <div ref={strip}>
      {items.map((item, i) => (
        <div key={i} className={item.kind}>{item.message}</div>
      ))}
    </div>
  );
}
