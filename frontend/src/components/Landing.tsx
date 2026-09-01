/**
 * Signed-out screen: a Hebrew, functionality-only summary of the app and a Google sign-in button.
 * The summary bullets mirror the root README's overview and must stay aligned with it, and they
 * name the שכפ"צ principle each tracked value serves — the carb score, which serves none, kept in
 * a bullet of its own so the acronym's count reads straight. A closing table spells the acronym
 * out — the one place in the app that does, the questionnaire and history headers carrying it as
 * a bare prefix — and sits past the sign-in button so the summary above stays about what the app
 * does, with the acronym's first mention linking down to it.
 * Rendered instead of the questionnaire until sign-in completes.
 */
import { APP_TITLE } from "../appTitle";

// Ties the intro's link to the table it jumps to, so neither can drift from the other.
const PRINCIPLES_ID = "landing-principles";
// The carb-grade ladder, published beside the app from frontend/public. The summary already names
// the score, so the grades hang off that name rather than a link line of their own.
const CARB_GRADES_PATH = "carb-grades.html";
export function Landing({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main className="landing">
      <h1>{APP_TITLE}</h1>
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
          מעבר לשכפ"צ, הרישום מניב ציון יומי של{" "}
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
      <button type="button" onClick={onSignIn}>התחברות עם Google</button>
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
      <p className="landing-repo">
        <a href="https://github.com/erancha/diet-tracker" target="_blank" rel="noreferrer">
          קוד המקור ב-GitHub
        </a>
      </p>
    </main>
  );
}
