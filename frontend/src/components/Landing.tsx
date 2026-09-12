/**
 * Signed-out screen. Opens condensed — friendly paragraphs naming what the app is about (no
 * calorie counting, the שכפ"צ habits spelled in place, the in-app chat where a deployment
 * configures the service answering it, progress graphs and weight tracking) over the more and
 * sign-in buttons — and a click on "יותר" swaps in the full summary: a Hebrew,
 * functionality-only rundown of the app. The same toggle reads "פחות" there, holding its spot
 * above the sign-in button, and folds the page back to the condensed intro.
 * The full summary's bullets mirror the root README's overview and must stay aligned with it, and
 * they name the שכפ"צ principle each tracked value serves — the carb score, which serves none,
 * kept in a bullet of its own so the acronym's count reads straight. A closing table spells the
 * acronym out — the questionnaire and history headers carry it as a bare prefix, and the condensed
 * intro names the words without their daily targets — and sits past the sign-in button so the
 * summary above stays about what the app does, with the acronym's first mention linking down
 * to it.
 * Rendered instead of the questionnaire until sign-in completes.
 */
import { useState } from "react";
import { whatsAppInviteUrl } from "../invite";
import { AppHeading } from "./AppHeading";

// Ties the intro's link to the table it jumps to, so neither can drift from the other.
const PRINCIPLES_ID = "landing-principles";
// The carb-grade ladder, published beside the app from frontend/public. The summary already names
// the score, so the grades hang off that name rather than a link line of their own.
const CARB_GRADES_PATH = "carb-grades.html";
// The animated walkthrough, published beside the app from the same directory. It is the one place
// a visitor can see the app work before deciding whether to sign in, so it leads the footer links.
const WALKTHROUGH_PATH = "demo.html";
export function Landing({ onSignIn, chatAvailable }: {
  onSignIn: () => void;
  // Whether this deployment configures the service answering the in-app chat. The landing page
  // advertises the app, so it names the chat only where there is one.
  chatAvailable: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const signInButton = (
    <button type="button" className="primary" onClick={onSignIn}>התחברות עם Google</button>
  );
  const toggleButton = (
    <button type="button" className="disclosure more-toggle" aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}>
      {expanded ? "פחות" : "יותר"}
    </button>
  );
  const walkthroughLink = (
    <p className="landing-walkthrough">
      <a href={WALKTHROUGH_PATH} target="_blank" rel="noreferrer">
        הדגמה: יום ביומן
      </a>{" "}
      {/* The replay opens at double speed and draws a phone on a workbench beside its narration,
          so both notes sit with the link rather than waiting to be discovered on the page they
          lead to. Outside the anchor, so the link's accessible name stays the walkthrough's own. */}
      <span className="landing-walkthrough-hint">(ניתן להאט את ההדגמה, מומלץ לראות במסך מחשב)</span>
    </p>
  );
  // A visitor is not the developer, so the invite always speaks as a received recommendation.
  const inviteLink = (
    <p className="landing-invite">
      <a href={whatsAppInviteUrl(false)} target="_blank" rel="noreferrer">
        הזמנת חברים ב-WhatsApp
      </a>
    </p>
  );
  const repoLink = (
    <p className="landing-repo">
      <a href="https://github.com/erancha/diet-tracker" target="_blank" rel="noreferrer">
        קוד המקור ב-GitHub
      </a>
    </p>
  );
  if (!expanded) {
    return (
      <main className="landing landing-brief">
        <AppHeading />
        {/* Each habit's bold initial spells the acronym in place, the way the full view's table
            opens its rows. */}
        <p className="landing-condensed">
          תזונה <strong>בלי לספור קלוריות</strong>: רושמים תיאור <strong>כללי</strong> של כל ארוחה,
          והאפליקציה עוזרת לשמור על <strong>ארבעה הרגלים פשוטים</strong> — שכפ"צ (<strong>ש</strong>תיה,{" "}
          <strong>כ</strong>מות ירקות, <strong>פ</strong>תיחת חלון אכילה, <strong>צ</strong>מצום ארוחות).
        </p>
        {chatAvailable && (
          <p className="landing-condensed">
            יש גם <strong>עוזר AI</strong> — צ'אט בתוך האפליקציה שעונה על שאלות על התוכנית (ישירות מתוך מסמכי
            המקור שלה) ואיך להשתמש באפליקציה. צ'אט אפשר לשתף עם כל המשתמשים, ולקרוא צ'אטים שאחרים שיתפו עם כולם.
          </p>
        )}
        <p className="landing-condensed">
          וההתקדמות נראית לעין: <strong>גרפים</strong> לאורך זמן ו<strong>מעקב משקל</strong> שבועי מול היעד.
        </p>
        {toggleButton}
        {signInButton}
        {walkthroughLink}
        {inviteLink}
        {repoLink}
      </main>
    );
  }
  return (
    <main className="landing">
      <AppHeading />
      <p className="landing-intro">
        אפליקציית SaaS חינמית — יומן ארוחות יומי שעוזר לשמור על הרגלי אכילה בריאים לאורך זמן.
        לא סופרים קלוריות, אלא בוחנים את אופי כל ארוחה ואת המרווחים ביניהן, לפי ארבעת עקרונות
        השכפ"צ (<a href={`#${PRINCIPLES_ID}`}>בטבלה שבסוף העמוד</a>):
      </p>
      <ul className="landing-summary">
        <li>
          כל ארוחה נרשמת כשהיא נאכלת, ואפשר להשלים את יום אתמול גם אחרי חצות. מהרישום נגזרים
          שלושה מארבעת עקרונות השכפ"צ: כמות הירקות, חלון האכילה ומספר הארוחות
        </li>
        <li>
          שתיית המים היא העיקרון הרביעי, היחיד שאינו נגזר מהיומן, ולכן יום שתועד במלואו נסגר
          בשאלון סיכום היום עם מילוי כמות המים בלבד
        </li>
        <li>
          מעבר לשכפ"צ, מהרישום מחושב גם ציון יומי: סכום הנקודות של כל הארוחות, לפי דרגת{" "}
          <a href={CARB_GRADES_PATH} target="_blank" rel="noreferrer">פחמימות / קמחים / סוכרים</a>
          {" "}של כל ארוחה והתוספות שלה (נמוך = טוב)
        </li>
        <li>
          גרף משקל שבועי: שקילה מול משקל יעד
        </li>
        <li>
          תזכורות והתראות נשלחות במייל (מומלץ לוודא שהן לא מגיעות לתיקיית הספאם), ואופציונלית
          גם בטלגרם: תזכורת כשדיווח של יום חסר, תזכורת שקילה שבועית וסיכום שבועי
        </li>
        {chatAvailable && (
          <li>
            שאלות על עקרונות התוכנית נענות בצ'אט בתוך האפליקציה, מתוך מסמכי המקור של התוכנית;
            צ'אט אפשר לשתף עם כל המשתמשים, וצ'אטים שמשתמשים אחרים שיתפו עם כולם פתוחים לקריאה
          </li>
        )}
      </ul>
      {toggleButton}
      {signInButton}
      {/* Each principle's bold initial opens its row, so the acronym reads down the first column. */}
      <table className="landing-principles" id={PRINCIPLES_ID}>
        <caption>שכפ"צ - העקרונות המרכזיים של המעקב</caption>
        <thead>
          <tr><th>העיקרון</th><th>היעד היומי</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>ש</strong>תיית מים</td><td>2.5 ליטר ומעלה</td></tr>
          <tr><td><strong>כ</strong>מות ירקות</td><td>ירקות בשתי ארוחות לפחות</td></tr>
          <tr><td><strong>פ</strong>תיחת חלון אכילה</td><td>עד 12 שעות מהארוחה הראשונה ועד האחרונה</td></tr>
          <tr><td><strong>צ</strong>מצום מספר ארוחות</td><td>2-3 ארוחות, בלי נשנושים ביניהן</td></tr>
        </tbody>
      </table>
      {walkthroughLink}
      {inviteLink}
      {repoLink}
    </main>
  );
}
