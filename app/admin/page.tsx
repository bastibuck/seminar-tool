import { listCaseTypes } from "@/lib/cases";
import { requireInstructorPage } from "@/lib/instructor-auth";
import { InstructorSession } from "../instructor-session";

import { TypeListClient } from "./type-list-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const instructor = await requireInstructorPage("/admin");
  const caseTypes = await listCaseTypes();

  return (
    <InstructorSession email={instructor.email} sessionKey={instructor.session_key} remainingMs={instructor.expires_at.getTime() - Date.now()}><main className="shell">
      <p className="eyebrow">Fallbibliothek</p>
      <h1>Falltypen</h1>
      <TypeListClient initialTypes={caseTypes} />
    </main></InstructorSession>
  );
}
