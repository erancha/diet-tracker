import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";

// The question the mail step's button puts to the chat. The app guide in the knowledge base
// answers it, so the wording has to keep asking what that guide explains.
export const VERIFY_MAIL_QUESTION =
  "איך מאשרים את כתובת המייל כדי לקבל את התזכורות, ואיך מונעים מהן להגיע לספאם?";

/**
 * The account's outstanding steps: the three that start tracking, shown until anything is
 * recorded, and confirming the address-verification mail, shown while the address is
 * undeliverable. autoFold tucks the steps away once the first-visit intro ends, unless a hand
 * toggle already claimed the fold for the visit.
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
