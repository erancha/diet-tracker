export function Header({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <header>
      <h1>שאלון תזונה יומי</h1>
      <span>
        {email} <button type="button" onClick={onSignOut}>התנתקות</button>
      </span>
    </header>
  );
}
