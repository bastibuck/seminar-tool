import { listCaseTypes } from "@/lib/cases";
import { requireInstructorPage } from "@/lib/instructor-auth";

import { TypeListClient } from "./type-list-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireInstructorPage("/admin");
  const caseTypes = await listCaseTypes();

  return (
    <main className="shell">
      <p className="eyebrow">Fallbibliothek</p>
      <h1>Falltypen</h1>
      <TypeListClient initialTypes={caseTypes} />
    </main>
  );
}
