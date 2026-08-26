/**
 * Signed-out screen: a Hebrew, functionality-only summary of the app and a Google sign-in button.
 * The summary bullets mirror the root README's overview and must stay aligned with it, and they
 * name the שכפ"צ principle each tracked value serves. A closing table spells the acronym out —
 * the one place in the app that does, the questionnaire and history headers carrying it as a bare
 * prefix — and sits past the sign-in button so the summary above stays about what the app does,
 * with the acronym's first mention linking down to it.
 * Rendered instead of the questionnaire until sign-in completes.
 */
// Ties the intro's link to the table it jumps to, so neither can drift from the other.
const PRINCIPLES_ID = "landing-principles";
export function Landing({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main className="landing">
      <h1>מעקב תזונה</h1>
      <p className="landing-intro">
        אפליקציית SaaS חינמית — יומן ארוחות יומי שעוזר לשמור על הרגלי אכילה בריאים לאורך זמן,
        סביב ארבעת עקרונות השכפ"צ (<a href={`#${PRINCIPLES_ID}`}>בטבלה שבסוף העמוד</a>):
      </p>
      <ul className="landing-summary">
        <li>
          רישום ארוחות ביומן מעקב יומי, כולל השלמה של יום אתמול למי שנזכר אחרי חצות
        </li>
        <li>
          ערכי סיכום היום נגזרים מהיומן: שלושה מעקרונות השכפ"צ — כמות הירקות, חלון האכילה ומספר
          הארוחות — לצד ציון פחמימות / קמחים / סוכרים (נמוך = טוב)
        </li>
        <li>
          שאלון סיכום היום אינו יכול להצהיר פחות ממה שנרשם ביומן; יום שתועד במלואו נסגר עם מילוי
          שתיית המים בלבד — העיקרון היחיד שאינו נגזר מהיומן
        </li>
        <li>
          האפליקציה כוללת תזכורת כשדיווח של יום חסר, התראה כשעיקרון שכפ"צ או ציון הפחמימות חורגים
          כמה ימים ברצף, סיכום שבועי וגרף מגמה של שבעת הימים האחרונים אחרי כל שליחה
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
