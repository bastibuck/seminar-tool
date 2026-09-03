import { listCaseTypes } from "@/lib/cases";

import { TypeListClient } from "./type-list-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const caseTypes = await listCaseTypes();

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: "40rem",
        margin: "0 auto",
        padding: "2rem",
      }}
    >
      <p>Admin</p>
      <h1>Falltypen</h1>
      <TypeListClient initialTypes={caseTypes} />
    </main>
  );
}
