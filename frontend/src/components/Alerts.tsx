import { useEffect, useRef } from "react";

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

// How long a batch of successes stays up. A success is read at a glance: it confirms what the
// user just did.
const DISMISS_MS = 5000;

// How long a batch carrying a fading item stays up. Longer than a success, because the user did
// not ask for it and has to notice it first — and because a fading item may offer a link, which
// has to be reachable before the batch goes.
const FADE_MS = 10_000;

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

  useEffect(() => {
    if (items.length === 0) return;
    strip.current!.scrollIntoView({ behavior: "smooth", block: "nearest" });
    // Anything else in the batch is waiting to be read at the user's pace, and keeps the whole
    // batch until the next action replaces it.
    if (items.some((item) => item.kind !== "ok" && item.fades !== true)) return;
    const timer = setTimeout(onDismiss,
                             items.some((item) => item.fades === true) ? FADE_MS : DISMISS_MS);
    return () => clearTimeout(timer);
  }, [items, onDismiss]);

  return (
    <div ref={strip}>
      {items.map((item, i) => (
        <div key={i} className={item.kind}>
          {item.link === undefined
            ? item.message
            : <LinkedMessage message={item.message} link={item.link} />}
        </div>
      ))}
    </div>
  );
}
