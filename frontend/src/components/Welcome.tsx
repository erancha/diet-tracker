import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";

// The question the mail step's button puts to the chat. The app guide in the knowledge base
// answers it, so the wording has to keep asking what that guide explains.
export const VERIFY_MAIL_QUESTION =
  "איך מאשרים את כתובת המייל כדי לקבל את התזכורות, ואיך מונעים מהן להגיע לספאם?";

/**
 * Greeting for an account that has recorded nothing yet: the three steps that start the tracking,
 * in the order they are taken, and — while mailStep says the address is still unconfirmed — the
 * mail step that makes the reminders deliverable: the address-verification request the sign-up
 * sends through Amazon Web Services, which the user has to confirm and will often find in spam.
 * Its button asks the chat to explain it.
 *
 * The caller reports the end of the first-visit intro through autoFold, which tucks the steps
 * behind the greeting — unless a hand toggle already claimed the fold, which then keeps it for
 * the visit. The panel stores nothing; what retires it is the emptiness it speaks to, so the
 * first weighing or meal removes it entirely, and until one of those happens a user who signed
 * in and stopped is met by it again, still needing it.
 */
export function Welcome({ autoFold, mailStep, onAskChat }: {
  autoFold: boolean;
  mailStep: boolean;
  onAskChat: (question: string) => void;
}) {
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
        {mailStep && (
          <li>
            מאשרים את בקשת אימות הכתובת מ-Amazon Web Services (גם בתיקיית הספאם) ומגדירים שהמיילים
            של האפליקציה לא יסומנו כספאם
            <button type="button" className="secondary compact"
                    onClick={() => onAskChat(VERIFY_MAIL_QUESTION)}>אישור המייל</button>
          </li>
        )}
      </ul>
    </CollapsibleSection>
  );
}
