"use client";

import { useState, type FormEvent } from "react";
import { useInstructorFetch } from "@/app/instructor-session";

export function InstructorForm() {
  const fetchInstructor = useInstructorFetch();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setPending(true);
    setError(null);
    setSuccess(false);
    try {
      const response = await fetchInstructor("/api/admin/instructors", { method: "POST", body: new FormData(form) });
      if (!response.ok) {
        const data = await response.json();
        setError(typeof data.error === "string" ? data.error : "Die Kursleitung konnte nicht angelegt werden.");
      } else {
        form.reset();
        setSuccess(true);
      }
    } catch {
      setError("Die Kursleitung konnte nicht angelegt werden. Bitte wende dich an die Administration.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="surface form-card start-case-form" onSubmit={submit}>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      {success ? <p role="status">Die Kursleitung wurde angelegt und kann sich anmelden. Beim ersten Anmelden muss sie ein neues Passwort festlegen.</p> : null}
      <div className="start-case-form__field">
        <label htmlFor="email">E-Mail-Adresse</label>
        <input id="email" name="email" type="email" autoComplete="off" required />
      </div>
      <div className="start-case-form__field">
        <label htmlFor="password">Vorläufiges Passwort</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required aria-describedby="password-hint" />
        <span id="password-hint" className="start-case-form__hint">Mindestens 12 Zeichen; Leerzeichen sind erlaubt.</span>
      </div>
      <button className="button start-case-form__submit" disabled={pending}>{pending ? "Wird angelegt…" : "Kursleitung hinzufügen"}</button>
    </form>
  );
}
