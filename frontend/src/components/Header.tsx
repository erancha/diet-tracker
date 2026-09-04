import { useEffect, useRef, useState } from "react";
import { APP_TITLE } from "../appTitle";
import { Icon } from "./Icon";

// App chrome: the title, the account menu, and — while rule violations are still active — an
// alarm that survives reloads, unlike the transient post-submit banner. The alarm starts closed
// so the warning presence is visible without leading every visit with the full messages.
//
// The account menu names the signed-in address and holds the account-level actions — signing
// out, and the reminder subscription — plus the one page-wide control, the global fold toggle.
// The address is identification rather than chrome the page needs standing, so it appears only
// when the menu it labels is open. Leaving is when a user decides they are done being reminded,
// so the opt-out is offered alongside the exit; it reads as a toggle, so the same menu is also
// the way back.
export function Header({ email, muted, onSignOut, onSetMuted, onFoldAll, nextFoldCollapses,
                         activeViolations }: {
  email: string; muted: boolean; onSignOut: () => void; onSetMuted: (muted: boolean) => void;
  onFoldAll: () => void;
  // Direction of the sweep onFoldAll will run, naming the fold item for what the press does.
  nextFoldCollapses: boolean;
  activeViolations: string[];
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
  return (
    <>
      <header>
        <h1>{APP_TITLE}</h1>
        <span className="account" ref={account}>
          <span className="account-actions">
            {activeViolations.length > 0 && (
              <button type="button" className="alarm" aria-label="חריגות פעילות"
                      onClick={() => setAlarmOpen((open) => !open)}>
                <Icon name="alarm" /> {activeViolations.length}
              </button>
            )}
            <button type="button" className="icon-only account-trigger" aria-haspopup="menu"
                    aria-expanded={menuOpen} aria-label="תפריט חשבון"
                    onClick={() => setMenuOpen((open) => !open)}>
              <Icon name={menuOpen ? "close" : "menu"} />
            </button>
          </span>
          {menuOpen && (
            <span className="account-menu">
              <span className="account-email">{email}</span>
              <span role="menu">
                <button type="button" role="menuitem" onClick={choose(() => onSetMuted(!muted))}>
                  <Icon name={muted ? "alarm" : "alarmOff"} />
                  {muted ? "חידוש התראות" : "ביטול התראות"}
                </button>
                <button type="button" role="menuitem" onClick={choose(onFoldAll)}>
                  <Icon name={nextFoldCollapses ? "foldAll" : "unfoldAll"} />
                  {nextFoldCollapses ? "צמצום כללי" : "הרחבה כללית"}
                </button>
                <button type="button" role="menuitem" onClick={choose(onSignOut)}>
                  <Icon name="signOut" />התנתקות
                </button>
              </span>
            </span>
          )}
        </span>
      </header>
      {alarmOpen && activeViolations.map((message) => (
        <div key={message} className="alert">{message}</div>
      ))}
    </>
  );
}
