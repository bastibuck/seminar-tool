import { listCaseTypes } from "@/lib/cases";
import { requireInstructorPage } from "@/lib/instructor-auth";
import { InstructorSession } from "./instructor-session";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const instructor = await requireInstructorPage("/");
  const { error } = await searchParams;
  const caseTypes = await listCaseTypes();

  return (
    <InstructorSession email={instructor.email} sessionKey={instructor.session_key} remainingMs={instructor.expires_at.getTime() - Date.now()}><main className="shell shell--narrow">
      <p className="eyebrow">Medizinisches Rollenspiel</p>
      <h1>Fall starten</h1>
      <p className="lede">Steuere einen vorbereiteten Fall im Cockpit und gib Befunde im richtigen Moment für den Seminarraum frei.</p>
      {error ? (
        <p role="alert" className="alert">
          {error}
        </p>
      ) : null}
      <form className="surface form-card start-case-form" method="post" action={`/api/cases?instructor_session=${instructor.session_key}`}>
        <div className="start-case-form__field">
          <label htmlFor="caseTypeId">Falltyp</label>
          <span className="start-case-form__hint">Wähle das vorbereitete Szenario.</span>
          <div className="start-case-form__select-wrap">
            <select id="caseTypeId" name="caseTypeId" required>
              {caseTypes.map((caseType) => (
                <option key={caseType.id} value={caseType.id}>
                  {caseType.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="start-case-form__field">
          <label htmlFor="name">Name des Falls</label>
          <span className="start-case-form__hint">So erkennst du diese Durchführung später im Cockpit.</span>
          <input
            id="name"
            name="name"
            required
            placeholder="z. B. Gruppe A – Montag"
          />
        </div>
        <button className="button start-case-form__submit" type="submit">
          Fall starten
        </button>
      </form>
    </main></InstructorSession>
  );
}
