export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="shell shell--narrow">
      <p className="eyebrow">Seminar Tool</p>
      <h1>Anmelden</h1>
      <p className="lede">Melde dich als Kursleitung an, um Fälle zu starten und zu steuern.</p>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      <SignInForm next={next ?? "/"} />
      <p>Passwort vergessen? Bitte wende dich an die Administration.</p>
    </main>
  );
}
import { SignInForm } from "./sign-in-form";
