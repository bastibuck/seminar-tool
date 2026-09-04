import { listCaseTypes } from "@/lib/cases";

import { TypeListClient } from "./type-list-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const caseTypes = await listCaseTypes();

  return (
    <main className="shell">
      <p className="eyebrow">Fallbibliothek</p>
      <h1>Falltypen</h1>
      <TypeListClient initialTypes={caseTypes} />
    </main>
  );
}
