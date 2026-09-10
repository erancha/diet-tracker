import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";

// The question the mail step's button puts to the chat. The app guide in the knowledge base
// answers it, so the wording has to keep asking what that guide explains.
export const VERIFY_MAIL_QUESTION =
  "איך מאשרים את כתובת המייל כדי לקבל את התזכורות, ואיך מונעים מהן להגיע לספאם?";

/**
 * The steps still outstanding for the account, and nothing it has already done.
 *
 * trackingSteps carries the three that start the tracking, in the order they are taken; they are
 * shown to an account that has recorded nothing, where all three are outstanding together, and
 * the first weighing or meal retires the set as a whole. mailStep carries the one that makes the
 * reminders deliverable — confirming the address-verification request the sign-up sends through
 * Amazon Web Services, which the user will often find in spam — and it stands on its own for as
 * long as the address is undeliverable, however far into tracking the account is. Its button asks
 * the chat to explain it.
 *
 * The heading names whichever set is showing, since a greeting reads wrong to an account that has
 * been tracking for weeks and only owes the mail step.
 *
 * The caller reports the end of the first-visit intro through autoFold, which tucks the steps
 * behind the heading — unless a hand toggle already claimed the fold, which then keeps it for the
 * visit. The panel stores nothing; what retires it is the steps running out.
 */
export function Welcome({ autoFold, trackingSteps, mailStep, onAskChat }: {
  autoFold: boolean;
  trackingSteps: boolean;
  mailStep: boolean;
  // Absent where the deployment configures no answering service; the step then keeps its
  // instructions alone, since asking is all the button does.
  onAskChat?: (question: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [engaged, setEngaged] = useState(false);

  useEffect(() => {
    if (autoFold && !engaged) setCollapsed(true);
  }, [autoFold, engaged]);

  return (
    <CollapsibleSection className="notice welcome"
                        title={trackingSteps ? "ברוכים הבאים ליומן!" : "אישור כתובת המייל"}
                        collapsed={collapsed}
                        onToggle={() => { setEngaged(true); setCollapsed((c) => !c); }}>
      <ul>
        {trackingSteps && (
          <>
            <li>קובעים משקל יעד ומזינים שקילה ראשונה</li>
            <li>רושמים כל ארוחה כשהיא נאכלת</li>
            <li>בערב סוגרים את היום בשאלון סיכום קצר</li>
          </>
        )}
        {mailStep && (
          <li>
            מאשרים את בקשת אימות הכתובת מ-Amazon Web Services (יש לחפש גם בתיקיית הספאם)
            ומגדירים שהמיילים של האפליקציה לא יסומנו כספאם
            {onAskChat !== undefined && (
              <button type="button" className="secondary compact"
                      onClick={() => onAskChat(VERIFY_MAIL_QUESTION)}>אישור המייל</button>
            )}
          </li>
        )}
      </ul>
    </CollapsibleSection>
  );
}
