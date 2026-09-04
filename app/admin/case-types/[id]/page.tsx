import { notFound } from "next/navigation";

import { getCaseTypeDetail } from "@/lib/admin";

import { FindingsEditor } from "./findings-editor";

export const dynamic = "force-dynamic";

type CaseTypePageProps = {
  params: Promise<{ id: string }>;
};

const CASE_TYPE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CaseTypePage({ params }: CaseTypePageProps) {
  const { id } = await params;

  if (!CASE_TYPE_ID_PATTERN.test(id)) notFound();

  const detail = await getCaseTypeDetail(id);
  if (!detail) notFound();

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: "40rem",
        margin: "0 auto",
        padding: "2rem",
      }}
    >
      <p>
        <a href="/admin">← Zurück zu den Falltypen</a>
      </p>
      <h1>{detail.name}</h1>
      <FindingsEditor
        caseTypeId={id}
        initialFindings={detail.findings.map((finding) => ({
           id: finding.id,
           name: finding.name,
           position: finding.position,
           imageUrl: finding.imageUrl,
        }))}
      />
    </main>
  );
}
