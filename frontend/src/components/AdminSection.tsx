import { useEffect, useState } from "react";
import type { Api } from "../api";
import type { AdminActivityUser } from "../types";
import { CollapsibleSection } from "./CollapsibleSection";

// The admin's per-user activity overview: each account's closed days, meals and chat questions
// over the trailing week and all time, its weighings, and whether it set a target (never the
// kilograms). It opens expanded and stays outside the menu's view command, since this listing is
// what the admin screen is for; the server is asked only while the section is open.
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
    <CollapsibleSection className="admin-section" title="פעילות משתמשים" collapsed={collapsed}
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
