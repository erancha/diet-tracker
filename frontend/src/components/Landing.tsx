/**
 * Signed-out screen. Opens condensed — three friendly paragraphs naming what the app is about
 * (no calorie counting, the שכפ"צ habits spelled in place, the in-app chat, progress graphs and
 * weight tracking) over the more and sign-in buttons — and a click on "יותר" swaps in the full
 * summary: a Hebrew, functionality-only rundown of the app. The same toggle reads "פחות" there,
 * holding its spot above the sign-in button, and folds the page back to the condensed intro.
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
import { AppHeading } from "./AppHeading";

// Ties the intro's link to the table it jumps to, so neither can drift from the other.
const PRINCIPLES_ID = "landing-principles";
// The carb-grade ladder, published beside the app from frontend/public. The summary already names
// the score, so the grades hang off that name rather than a link line of their own.
const CARB_GRADES_PATH = "carb-grades.html";
export function Landing({ onSignIn }: { onSignIn: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const signInButton = (
    <button type="button" onClick={onSignIn}>התחברות עם Google</button>
  );
  const toggleButton = (
    <button type="button" className="more-toggle" onClick={() => setExpanded(!expanded)}>
      {expanded ? "פחות" : "יותר"}
    </button>
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
          תזונה בלי לספור קלוריות: רושמים כל ארוחה, והאפליקציה עוזרת לשמור על ארבעה הרגלים
          פשוטים — שכפ"צ (<strong>ש</strong>תיה, <strong>כ</strong>מות ירקות,{" "}
          <strong>פ</strong>תיחת חלון אכילה, <strong>צ</strong>מצום ארוחות).
        </p>
        <p className="landing-condensed">
          יש גם עוזר חכם — צ'אט בתוך האפליקציה שעונה על שאלות על התוכנית, ישירות מתוך מסמכי
          המקור שלה.
        </p>
        <p className="landing-condensed">
          וההתקדמות נראית לעין: גרפים לאורך זמן ומעקב משקל שבועי מול היעד.
        </p>
        {toggleButton}
        {signInButton}
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
          מעבר לשכפ"צ, מהרישום מחושב גם ציון יומי של{" "}
          <a href={CARB_GRADES_PATH} target="_blank" rel="noreferrer">פחמימות / קמחים / סוכרים</a>
          {" "}(נמוך = טוב)
        </li>
        <li>
          גרף משקל שבועי: שקילה מול משקל יעד
        </li>
        <li>
          תזכורות והתראות נשלחות במייל: תזכורת כשדיווח של יום חסר, תזכורת שקילה שבועית, התראה
          כשציון הפחמימות חורג כמה ימים ברצף וסיכום שבועי
        </li>
        <li>
          שאלות על עקרונות התוכנית נענות בצ'אט בתוך האפליקציה, מתוך מסמכי המקור של התוכנית
        </li>
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
      {repoLink}
    </main>
  );
}
