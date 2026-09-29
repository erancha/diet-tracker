import { useEffect, useRef, useState } from "react";

// A word of an item's message rendered as a control rather than as text, with what pressing it
// does. The word must occur in the message.
export interface AlertLink {
  word: string;
  onClick: () => void;
}

export interface AlertItem {
  // Doubles as the item's class: alert for a failure, ok for a success, notice for something the
  // user should know but need not act on, crossing for a bound a day went past.
  kind: "alert" | "ok" | "notice" | "crossing";
  message: string;
  // Marks an item that clears itself rather than waiting to be read — a reminder the page raised
  // on its own, which no action of the user's is waiting on.
  fades?: true;
  link?: AlertLink;
}

// How long a success or a fading item stays up, whatever shares its batch. Both are read at a
// glance: a success confirms what the user just did, a fading item repeats what the page already
// marks elsewhere.
const DISMISS_MS = 5000;

// One item's message with its linked word turned into a button, the rest left as text.
function LinkedMessage({ message, link }: { message: string; link: AlertLink }) {
  const at = message.indexOf(link.word);
  if (at < 0) throw new Error(`alert link "${link.word}" is not in "${message}"`);
  return (
    <>
      {message.slice(0, at)}
      <button type="button" className="message-link" onClick={link.onClick}>{link.word}</button>
      {message.slice(at + link.word.length)}
    </>
  );
}

// The screen's one message strip — every action reports here. It sits above a page tall enough to
// push it off screen, so a fresh batch scrolls itself into view instead of waiting to be found.
export function Alerts({ items, onDismiss }: { items: AlertItem[]; onDismiss: () => void }) {
  const strip = useRef<HTMLDivElement>(null);
  // The batch whose successes have had their time; the rest of that batch stays on screen.
  const [successesGoneFrom, setSuccessesGoneFrom] = useState<AlertItem[] | null>(null);

  useEffect(() => {
    if (items.length === 0) return;
    strip.current!.scrollIntoView({ behavior: "smooth", block: "nearest" });
    // Anything else in the batch is waiting to be read at the user's pace, and keeps the rest of
    // the batch until the next action replaces it.
    if (items.some((item) => item.kind !== "ok" && item.fades !== true)) {
      if (!items.some((item) => item.kind === "ok")) return;
      const timer = setTimeout(() => setSuccessesGoneFrom(items), DISMISS_MS);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(onDismiss, DISMISS_MS);
    return () => clearTimeout(timer);
  }, [items, onDismiss]);

  const shown = successesGoneFrom === items ? items.filter((item) => item.kind !== "ok") : items;

  return (
    <div ref={strip}>
      {shown.map((item, i) => (
        <div key={i} className={item.kind}>
          {item.link === undefined
            ? item.message
            : <LinkedMessage message={item.message} link={item.link} />}
        </div>
      ))}
    </div>
  );
}
