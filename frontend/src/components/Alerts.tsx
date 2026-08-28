import { useEffect, useRef } from "react";

export interface AlertItem {
  // Doubles as the item's class: alert for a failure or a violation, ok for a success, notice for
  // something the user should know but need not act on.
  kind: "alert" | "ok" | "notice";
  message: string;
}

// A batch of nothing but successes clears itself after this long. Anything else in the batch —
// a failure, a violation, a notice — keeps it until the next action replaces it: those are read at
// the user's pace.
const OK_DISMISS_MS = 5000;

// The screen's one message strip — every action reports here. It sits above a page tall enough to
// push it off screen, so a fresh batch scrolls itself into view instead of waiting to be found.
export function Alerts({ items, onDismiss }: { items: AlertItem[]; onDismiss: () => void }) {
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (items.length === 0) return;
    strip.current!.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (items.some((item) => item.kind !== "ok")) return;
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
