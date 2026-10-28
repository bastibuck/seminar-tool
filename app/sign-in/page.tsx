export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="shell shell--narrow">
      <p className="eyebrow">Seminar Tool</p>
      <h1>Anmelden</h1>
      <p className="lede">Melde dich als Kursleitung an, um Fälle zu starten und zu steuern.</p>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      <form className="surface form-card" action="/api/instructor/sign-in" method="post">
        <input type="hidden" name="next" value={next ?? "/"} />
        <label htmlFor="email">E-Mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
        <label htmlFor="password">Passwort</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <button className="button" type="submit">Anmelden</button>
      </form>
      <p>Passwort vergessen? Bitte wende dich an die Administration.</p>
    </main>
  );
}
