/**
 * Signed-out screen: a Hebrew, functionality-only summary of the app and a Google sign-in button.
 * Rendered instead of the questionnaire until sign-in completes.
 */
export function Landing({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main>
      <h1>מעקב תזונה</h1>
      <p>שאלון תזונה יומי קצר שעוזר לשמור על הרגלי אכילה בריאים לאורך זמן:</p>
      <ul>
        <li>מילוי דיווח יומי קצר, כולל השלמה של יום אתמול למי שנזכר אחרי חצות</li>
        <li>תזכורת כשדיווח של יום חסר</li>
        <li>התראה כשכלל תזונה מופר כמה ימים ברצף</li>
        <li>סיכום שבועי</li>
        <li>גרף מגמה של שבעת הימים האחרונים אחרי כל שליחה</li>
      </ul>
      <button type="button" onClick={onSignIn}>התחברות עם Google</button>
    </main>
  );
}
