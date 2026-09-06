import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";

/**
 * Greeting for an account that has recorded nothing yet: the three steps that start the tracking,
 * in the order they are taken.
 *
 * The caller reports the end of the first-visit intro through autoFold, which tucks the steps
 * behind the greeting — unless a hand toggle already claimed the fold, which then keeps it for
 * the visit. The panel stores nothing; what retires it is the emptiness it speaks to, so the
 * first weighing or meal removes it entirely, and until one of those happens a user who signed
 * in and stopped is met by it again, still needing it.
 */
export function Welcome({ autoFold }: { autoFold: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const [engaged, setEngaged] = useState(false);

  useEffect(() => {
    if (autoFold && !engaged) setCollapsed(true);
  }, [autoFold, engaged]);

  return (
    <CollapsibleSection className="notice welcome" title="ברוכים הבאים ליומן!"
                        collapsed={collapsed}
                        onToggle={() => { setEngaged(true); setCollapsed((c) => !c); }}>
      <ul>
        <li>קובעים משקל יעד ומזינים שקילה ראשונה</li>
        <li>רושמים כל ארוחה כשהיא נאכלת</li>
        <li>בערב סוגרים את היום בשאלון סיכום קצר</li>
      </ul>
    </CollapsibleSection>
  );
}
