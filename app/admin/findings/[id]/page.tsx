import { notFound } from "next/navigation";

import { getFinding } from "@/lib/admin";

import { FindingEditor } from "./finding-editor";

export const dynamic = "force-dynamic";

export default async function FindingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const finding = await getFinding(id);
  if (!finding) notFound();
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: "40rem", margin: "0 auto", padding: "2rem" }}>
      <p><a href={`/admin/case-types/${finding.caseTypeId}`}>← Zurück zum Falltyp</a></p>
      <h1>Befund bearbeiten</h1>
      <FindingEditor finding={finding} />
    </main>
  );
}
