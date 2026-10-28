import { redirect } from "next/navigation";
import { currentInstructor } from "@/lib/instructor-auth";

export const dynamic = "force-dynamic";

export default async function PasswordSetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const instructor = await currentInstructor();
  if (!instructor) redirect("/sign-in");
  if (!instructor.setup_required) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="shell shell--narrow">
      <p className="eyebrow">Kursleitung</p>
      <h1>Passwort festlegen</h1>
      <p className="lede">Wähle ein neues Passwort mit mindestens 12 Zeichen. Leerzeichen sind erlaubt.</p>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      <form className="surface form-card" action="/api/instructor/password-setup" method="post">
        <label htmlFor="password">Neues Passwort</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
        <label htmlFor="confirmation">Passwort wiederholen</label>
        <input id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={12} required />
        <button className="button" type="submit">Passwort speichern</button>
      </form>
    </main>
  );
}
