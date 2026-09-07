import { useEffect, useState } from "react";
import type { Api } from "../api";
import type { AdminActivityUser } from "../types";
import { CollapsibleSection } from "./CollapsibleSection";

// The admin's per-user activity overview: every pool account as a card with its closed-day, meal
// and chat-question counts split into a trailing-week and an all-time column, its all-time
// weighing count and a target-set check (never the kilograms), in the server's order — the
// trailing week decides who counts as most active. Rendered for the
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
          <ul className="admin-users">
            {users.map((user) => (
              <li key={user.email} className="admin-user-card">
                <h4>{user.email}</h4>
                <table className="admin-user-counts">
                  <thead>
                    <tr><th /><th scope="col">7 ימים אחרונים</th><th scope="col">סה״כ</th></tr>
                  </thead>
                  <tbody>
                    <tr><th scope="row">ימים שנסגרו</th><td>{user.days.week}</td><td>{user.days.total}</td></tr>
                    <tr><th scope="row">ארוחות</th><td>{user.meals.week}</td><td>{user.meals.total}</td></tr>
                    <tr><th scope="row">שאלות</th><td>{user.chats.week}</td><td>{user.chats.total}</td></tr>
                    <tr><th scope="row">שקילות</th><td /><td>{user.weights}</td></tr>
                  </tbody>
                </table>
                <div className="admin-user-target"><span>משקל יעד</span><span>{user.target ? "✅" : "—"}</span></div>
              </li>
            ))}
          </ul>
        )}
    </CollapsibleSection>
  );
}
