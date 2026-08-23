import { useState } from "react";

// App chrome: the title, the account box, and — while rule violations are still active — an
// alarm that survives reloads, unlike the transient post-submit banner. The alarm starts closed
// so the warning presence is visible without leading every visit with the full messages.
export function Header({ email, onSignOut, activeViolations }: {
  email: string; onSignOut: () => void; activeViolations: string[];
}) {
  const [alarmOpen, setAlarmOpen] = useState(false);
  return (
    <>
      <header>
        <h1>שאלון תזונה יומי</h1>
        <span>
          {email} <button type="button" onClick={onSignOut}>התנתקות</button>
          {activeViolations.length > 0 && (
            <button type="button" className="alarm" aria-label="חריגות פעילות"
                    onClick={() => setAlarmOpen((open) => !open)}>
              🔔 {activeViolations.length}
            </button>
          )}
        </span>
      </header>
      {alarmOpen && activeViolations.map((message) => (
        <div key={message} className="alert">{message}</div>
      ))}
    </>
  );
}
