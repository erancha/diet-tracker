/**
 * Greeting for an account that has recorded nothing yet: the three steps that start the tracking,
 * in the order they are taken.
 *
 * It carries no dismissal of its own and stores nothing. What renders it is the emptiness it
 * speaks to, so the first weighing or meal retires it — and until one of those happens, a user who
 * signed in and stopped is met by it again, still needing it.
 */
export function Welcome() {
  return (
    <section className="notice welcome">
      <h2>ברוכים הבאים ליומן!</h2>
      <ul>
        <li>קובעים משקל יעד ומזינים שקילה ראשונה</li>
        <li>רושמים כל ארוחה כשהיא נאכלת</li>
        <li>בערב סוגרים את היום בשאלון סיכום היום</li>
      </ul>
    </section>
  );
}
