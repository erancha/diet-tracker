// The WhatsApp invite — the single source for the account menu's item and the landing page's
// link, so the pitch cannot drift between the two.

// The invite pitch, minus its opening line: what makes the app worth joining.
const PITCH_LINES = [
  "🤖 עוזר AI זמין תמיד — עונה על כל שאלה ישר מתוך מסמכי התוכנית",
  "📊 רואים התקדמות: גרפים יומיים ומעקב משקל מול יעד",
  "📧 והאפליקציה שומרת עליך בתלם — תזכורות במייל בדיוק כשצריך",
];

// The call to action, pointing at the app link on the line below the arrow.
const SIGN_UP_CALL = "נרשמים בחינם עם חשבון Google 👇";

// The wa.me composer with the invite prefilled, leaving only the pick of a contact or group.
// The admin invites as the app's developer; everyone else passes on a recommendation. The app's
// address closes the message on a line of its own, so WhatsApp renders it as a tappable link
// with a preview — and coming from the page's own origin, it names whichever environment sent it.
export function whatsAppInviteUrl(developedBySender: boolean): string {
  const opening = developedBySender ? "פיתחתי" : "קיבלתי המלצה על";
  const message = [
    `🥗 היי! ${opening} אפליקציה חינמית למעקב תזונה — במקום לספור קלוריות, מתמקדים ב-4 ` +
      "הרגלים בריאים ופשוטים ששומרים עליך לאורך זמן",
    ...PITCH_LINES,
    // The blank line sets the call to action apart from the pitch above it.
    "",
    SIGN_UP_CALL,
    window.location.origin,
  ].join("\n");
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
