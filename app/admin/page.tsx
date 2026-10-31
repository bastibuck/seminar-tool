import { listCaseTypes } from "@/lib/cases";
import { requireInstructorPage } from "@/lib/instructor-auth";
import { canCreateInstructors } from "@/lib/instructor-creation";
import { InstructorSession } from "../instructor-session";

import { TypeListClient } from "./type-list-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const instructor = await requireInstructorPage("/admin");
  const [caseTypes, canCreate] = await Promise.all([listCaseTypes(), canCreateInstructors(instructor.user_id)]);

  return (
    <InstructorSession email={instructor.email} sessionKey={instructor.session_key} remainingMs={instructor.expires_at.getTime() - Date.now()}><main className="shell">
      <p className="eyebrow">Fallbibliothek</p>
      <h1>Falltypen</h1>
      <TypeListClient initialTypes={caseTypes} canCreateInstructors={canCreate} />
    </main></InstructorSession>
  );
}
