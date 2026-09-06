import { useEffect, useState } from "react";
import type { Api } from "../api";
import type { AdminActivityUser } from "../types";
import { CollapsibleSection } from "./CollapsibleSection";

// The admin's per-user activity overview: every pool account as a card with its trailing-week
// closed-day, meal and chat-question counts, its all-time weighing count and a target-set check
// (never the kilograms), in the server's most-active-first order. Rendered for the
// admin alone (the API refuses anyone else), and always opening expanded: the listing is what
// the admin screen exists to show, so it stands outside the menu's condensed/full view command
// and only its own toggle folds it. The server is asked only while open, so a hand-folded
// section stops re-fetching.
export function AdminSection({ api }: { api: Pick<Api, "getAdminActivity"> }) {
  const [collapsed, setCollapsed] = useState(false);
  const [users, setUsers] = useState<AdminActivityUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (collapsed || users !== null) return;
    api.getAdminActivity()
      .then((activity) => setUsers(activity.users))
      .catch((thrown) => setError(`טעינת הפעילות נכשלה (${(thrown as Error).message})`));
  }, [collapsed, users, api]);

  return (
    <CollapsibleSection title="פעילות משתמשים" collapsed={collapsed}
                        onToggle={() => setCollapsed((current) => !current)}>
      {error !== null ? <div className="alert">{error}</div>
        : users === null ? <p>טוען…</p>
        : (
          <>
            <p className="admin-week-note">שבעת הימים האחרונים</p>
            <ul className="admin-users">
              {users.map((user) => (
                <li key={user.email} className="admin-user-card">
                  <h4>{user.email}</h4>
                  <dl>
                    <div><dt>ימים שנסגרו</dt><dd>{user.days}</dd></div>
                    <div><dt>ארוחות</dt><dd>{user.meals}</dd></div>
                    <div><dt>שאלות</dt><dd>{user.chats}</dd></div>
                    <div><dt>משקל יעד</dt><dd>{user.target ? "✅" : "—"}</dd></div>
                    <div><dt>שקילות סה״כ</dt><dd>{user.weights}</dd></div>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
    </CollapsibleSection>
  );
}
