import { notFound } from "next/navigation";

import { formatCaseCode, normalizeCode } from "@/lib/case-code";
import { getCaseByCode } from "@/lib/cases";

import { ViewerRealtime } from "./viewer-realtime";

export const dynamic = "force-dynamic";

type ViewerPageProps = {
  params: Promise<{ code: string }>;
};

export default async function ViewerPage({ params }: ViewerPageProps) {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);

  const viewerCase = await getCaseByCode(code);
  if (!viewerCase) notFound();

  return (
    <main className="shell">
      <p className="eyebrow">Seminarraum</p>
      <h1>{viewerCase.name}</h1>
      <p>
        Fallcode: <span className="code">{formatCaseCode(code)}</span>
      </p>
      <ViewerRealtime
        caseId={viewerCase.caseId}
        caseCode={formatCaseCode(code)}
        initialFindings={viewerCase.findings}
        initialEnded={viewerCase.endedAt !== null}
      />
    </main>
  );
}
