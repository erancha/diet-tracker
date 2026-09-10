import { useEffect, useRef, useState } from "react";
import { instantLabel } from "../dates";
import { whatsAppInviteUrl } from "../invite";
import type { UndeliveredMessage } from "../types";
import { AppHeading } from "./AppHeading";
import { Icon } from "./Icon";

// Says why an email's text is being read in the app: without it the bell would show a bare
// reminder with nothing to explain how it got there.
const UNDELIVERED_LEAD = "הודעות שנשלחו אליכם ולא הגיעו לדוא״ל:";

// The way out of the situation, named where the user meets it, and true only while the address is
// undeliverable — a verified address has nothing left to confirm. Delivery is refused until the
// address is confirmed from the request AWS sends it, and that request is itself a mail the
// recipient never asked for from a sender they do not know — so it commonly lands in spam, and
// the sender is named here because that is what makes it findable.
const UNDELIVERED_VERIFY_HINT =
  "כדי לקבל אותן במייל יש לאשר את בקשת אימות הכתובת מ-Amazon Web Services — חפשו אותה גם בתיקיית הספאם.";

// What each account-menu item reaches, shown on hover. The labels name the act in a word or two,
// which is enough to pick from once you know the menu and too little the first time — so the
// explanation lives here rather than lengthening the labels themselves.
const ACCOUNT_HINTS = {
  email: "הכתובת שאיתה התחברת",
  mute: "השתקת כל התזכורות וההתראות שנשלחות במייל",
  unmute: "חידוש התזכורות וההתראות שנשלחות במייל",
  view: "פתיחה או קיפול של כל סעיפי העמוד יחד; הבחירה נשמרת לכניסה הבאה",
  invite: "שיתוף קישור הזמנה לאפליקציה ב-WhatsApp",
  signOut: "יציאה מהחשבון",
};

// App chrome: the title, the account menu, and — while anything is still awaiting the user — an
// alarm that survives reloads, unlike the transient post-submit banner. The alarm starts closed
// so the presence of notices is visible without leading every visit with their full texts.
//
// It holds two kinds at once, counted together but never styled alike: rule violations, which
// are alarming and read red, and messages the app failed to email, which are only what the inbox
// should have carried and read as plain notes, each dated by the attempt that failed and
// dismissable once read.
//
// The account menu names the signed-in address and holds the account-level actions — signing
// out, the reminder subscription, and the WhatsApp invite — plus the one page-wide control, the
// condensed/full view toggle. The address is identification rather than chrome the page needs
// standing, so it appears only when the menu it labels is open. Leaving is when a user decides they are done
// being reminded, so the opt-out is offered alongside the exit; it reads as a toggle, so the
// same menu is also the way back.
export function Header({ email, muted, isAdmin, onSignOut, onSetMuted, onFoldAll,
                         nextViewCondensed, activeViolations, undelivered, emailVerified,
                         onDismissUndelivered }: {
  email: string; muted: boolean;
  // Picks the invite's opening voice: the admin invites as the app's developer.
  isAdmin: boolean;
  onSignOut: () => void; onSetMuted: (muted: boolean) => void;
  onFoldAll: () => void;
  // The view a press of the item will switch to, naming the item for what the press does.
  nextViewCondensed: boolean;
  activeViolations: string[];
  undelivered: UndeliveredMessage[];
  emailVerified: boolean;
  onDismissUndelivered: (at: string) => void;
}) {
  const [alarmOpen, setAlarmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // The menu floats over the page, so the two gestures that dismiss a floating layer have to be
  // heard on the document rather than on the menu itself: a press anywhere outside it, and Escape.
  const account = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: MouseEvent) => {
      if (!account.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", onEscape);
    };
  }, [menuOpen]);

  const choose = (action: () => void) => () => { setMenuOpen(false); action(); };
  const noticeCount = activeViolations.length + undelivered.length;
  return (
    <>
      <header>
        <AppHeading />
        <span className="account" ref={account}>
          <span className="account-actions">
            {noticeCount > 0 && (
              <button type="button" className="secondary compact alarm" aria-label="התראות ממתינות"
                      aria-expanded={alarmOpen}
                      onClick={() => setAlarmOpen((open) => !open)}>
                <Icon name="alarm" /> {noticeCount}
              </button>
            )}
            <button type="button" className="glyph account-trigger" aria-haspopup="menu"
                    aria-expanded={menuOpen} aria-label="תפריט חשבון"
                    onClick={() => setMenuOpen((open) => !open)}>
              <Icon name={menuOpen ? "close" : "menu"} />
            </button>
          </span>
          {menuOpen && (
            <span className="account-menu">
              <span className="account-email" title={ACCOUNT_HINTS.email}>{email}</span>
              {/* Each item's label names the act; the tooltip says what it reaches, since a menu
                  of four short labels cannot carry that on its own. */}
              <span role="menu">
                <button type="button" role="menuitem" className="menu-item"
                        title={muted ? ACCOUNT_HINTS.unmute : ACCOUNT_HINTS.mute}
                        onClick={choose(() => onSetMuted(!muted))}>
                  <Icon name={muted ? "alarm" : "alarmOff"} />
                  {muted ? "חידוש התראות" : "ביטול התראות"}
                </button>
                <button type="button" role="menuitem" className="menu-item" title={ACCOUNT_HINTS.view}
                        onClick={choose(onFoldAll)}>
                  <Icon name={nextViewCondensed ? "foldAll" : "unfoldAll"} />
                  {nextViewCondensed ? "תצוגה מצומצמת" : "תצוגה מלאה"}
                </button>
                <a role="menuitem" className="menu-item" title={ACCOUNT_HINTS.invite}
                   href={whatsAppInviteUrl(isAdmin)} target="_blank"
                   rel="noreferrer" onClick={() => setMenuOpen(false)}>
                  <Icon name="share" />הזמנת חברים ב-WhatsApp
                </a>
                <button type="button" role="menuitem" className="menu-item" title={ACCOUNT_HINTS.signOut}
                        onClick={choose(onSignOut)}>
                  <Icon name="signOut" />התנתקות
                </button>
              </span>
            </span>
          )}
        </span>
      </header>
      {alarmOpen && (
        <>
          {activeViolations.map((message) => (
            <div key={message} className="alert">{message}</div>
          ))}
          {undelivered.length > 0 && (
            <p className="undelivered-aside">{UNDELIVERED_LEAD}</p>
          )}
          {undelivered.map((message) => (
            <div key={message.at} className="notice undelivered">
              <span className="undelivered-head">
                <time dateTime={message.at}>{instantLabel(message.at)}</time>
                <button type="button" className="glyph"
                        aria-label={`סגירת ההודעה ${message.subject}`}
                        onClick={() => onDismissUndelivered(message.at)}>
                  <Icon name="remove" />
                </button>
              </span>
              <strong>{message.subject}</strong>
              {/* The mail's own HTML, in a frame that may do nothing but draw it: no scripts, no
                  same-origin access, no navigation. The body it renders is escaped server-side,
                  so this is defence in depth rather than the only guard. */}
              <iframe className="undelivered-body" title={message.subject} sandbox=""
                      srcDoc={message.html} />
            </div>
          ))}
          {undelivered.length > 0 && !emailVerified && (
            <p className="undelivered-aside trailing">{UNDELIVERED_VERIFY_HINT}</p>
          )}
        </>
      )}
    </>
  );
}
