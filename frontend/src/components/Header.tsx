export function Header({ email }: { email: string }) {
  return (
    <header>
      <h1>שאלון תזונה יומי</h1>
      <span>{email}</span>
    </header>
  );
}
