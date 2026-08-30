import { notFound } from "next/navigation";

import { formatCaseCode, normalizeCode } from "@/lib/case-code";
import { getCaseByCode } from "@/lib/cases";

import { ViewerRealtime } from "./viewer-realtime";

export const dynamic = "force-dynamic";

const pageStyle = {
  fontFamily: "system-ui, sans-serif",
  maxWidth: "40rem",
  margin: "0 auto",
  padding: "2rem",
} as const;

const codeStyle = {
  fontSize: "1.1rem",
  letterSpacing: "0.05em",
  fontWeight: 600,
  fontFamily: "monospace",
} as const;

type ViewerPageProps = {
  params: Promise<{ code: string }>;
};

export default async function ViewerPage({ params }: ViewerPageProps) {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);

  const viewerCase = await getCaseByCode(code);
  if (!viewerCase) notFound();

  return (
    <main style={pageStyle}>
      <p style={{ color: "#57606a", marginBottom: "0.25rem" }}>Viewer</p>
      <h1>{viewerCase.name}</h1>
      <p>
        Fallcode: <span style={codeStyle}>{formatCaseCode(code)}</span>
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
