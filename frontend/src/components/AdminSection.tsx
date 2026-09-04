import { useEffect, useState } from "react";
import type { Api } from "../api";
import type { AdminActivityUser } from "../types";
import { CollapsibleSection } from "./CollapsibleSection";
import { useGlobalFold } from "./useFoldAll";

// The admin's per-user activity overview: every pool account with its trailing-week closed-day,
// meal, and chat-question counts, in the server's most-active-first order. Rendered for the
// admin alone (the API refuses anyone else), resting folded and asking the server only when
// first opened — the listing costs three count queries per pool account, so a page load must
// not spend that on a section nobody opened.
export function AdminSection({ api }: { api: Pick<Api, "getAdminActivity"> }) {
  const [collapsed, setCollapsed] = useState(true);
  useGlobalFold(setCollapsed);
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
          <table>
            <caption>שבעת הימים האחרונים</caption>
            <thead>
              <tr><th>משתמש</th><th>ימים שנסגרו</th><th>ארוחות</th><th>שאלות</th></tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.email}>
                  <td>{user.email}</td>
                  <td>{user.days}</td>
                  <td>{user.meals}</td>
                  <td>{user.chats}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </CollapsibleSection>
  );
}
