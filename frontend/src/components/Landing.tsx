/**
 * Signed-out screen: a Hebrew, functionality-only summary of the app and a Google sign-in button.
 * The summary bullets mirror the root README's overview and must stay aligned with it.
 * Rendered instead of the questionnaire until sign-in completes.
 */
export function Landing({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main className="landing">
      <h1>מעקב תזונה</h1>
      <p>אפליקציית SaaS חינמית — יומן ארוחות יומי שעוזר לשמור על הרגלי אכילה בריאים לאורך זמן:</p>
      <ul className="landing-summary">
        <li>
          רישום ארוחות תוך כדי היום, כולל השלמה של יום אתמול למי שנזכר אחרי חצות
        </li>
        <li>
          ערכי היום נגזרים מהיומן: ציון פחמימות / קמחים / סוכרים (נמוך = טוב), מספר ארוחות,
          ארוחות עם ירקות וחלון האכילה
        </li>
        <li>
          שאלון סוף היום לא יכול להצהיר פחות ממה שנרשם ביומן; יום שתועד במלואו נסגר עם מילוי שתייה
          בלבד
        </li>
        <li>
          תזכורת כשדיווח של יום חסר, התראה כשכלל תזונה מופר כמה ימים ברצף, סיכום שבועי וגרף מגמה
          של שבעת הימים האחרונים אחרי כל שליחה
        </li>
      </ul>
      <button type="button" onClick={onSignIn}>התחברות עם Google</button>
      <p className="landing-repo">
        <a href="https://github.com/erancha/diet-tracker" target="_blank" rel="noreferrer">
          קוד המקור ב-GitHub
        </a>
      </p>
    </main>
  );
}
