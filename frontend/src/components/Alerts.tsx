import { useEffect, useRef } from "react";

export interface AlertItem {
  // Doubles as the item's class: alert for a failure, ok for a success, notice for something the
  // user should know but need not act on, crossing for a bound a day went past.
  kind: "alert" | "ok" | "notice" | "crossing";
  message: string;
  // Marks an item that clears itself rather than waiting to be read — a reminder the page raised
  // on its own, which no action of the user's is waiting on.
  fades?: true;
}

// How long a batch that clears itself stays up. A success does so by nature, and so does an item
// marked as fading; anything else keeps the batch until the next action replaces it, since those
// are read at the user's pace.
const DISMISS_MS = 5000;

// The screen's one message strip — every action reports here. It sits above a page tall enough to
// push it off screen, so a fresh batch scrolls itself into view instead of waiting to be found.
export function Alerts({ items, onDismiss }: { items: AlertItem[]; onDismiss: () => void }) {
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (items.length === 0) return;
    strip.current!.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (items.some((item) => item.kind !== "ok" && item.fades !== true)) return;
    const timer = setTimeout(onDismiss, DISMISS_MS);
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
