import { notFound } from "next/navigation";

import { formatCaseCode } from "@/lib/case-code";
import { getCaseByCode } from "@/lib/cases";

export const dynamic = "force-dynamic";

const pageStyle = {
  fontFamily: "system-ui, sans-serif",
  maxWidth: "40rem",
  margin: "0 auto",
  padding: "2rem",
} as const;

const feedItemStyle = {
  marginBottom: "1.5rem",
  padding: "1rem",
  border: "1px solid #d0d7de",
  borderRadius: "6px",
} as const;

const waitingStyle = {
  color: "#57606a",
  fontSize: "1.1rem",
  marginTop: "2rem",
} as const;

const codeStyle = {
  fontSize: "1.1rem",
  letterSpacing: "0.05em",
  fontWeight: 600,
  fontFamily: "monospace",
} as const;

const timeFormat = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Europe/Berlin",
});

type ViewerPageProps = {
  params: Promise<{ code: string }>;
};

export default async function ViewerPage({ params }: ViewerPageProps) {
  const { code: rawCode } = await params;
  const code = rawCode.replace("-", "").toUpperCase();

  const viewerCase = await getCaseByCode(code);
  if (!viewerCase) notFound();

  return (
    <main style={pageStyle}>
      <p style={{ color: "#57606a", marginBottom: "0.25rem" }}>Viewer</p>
      <h1>{viewerCase.name}</h1>
      <p>
        Fallcode: <span style={codeStyle}>{formatCaseCode(code)}</span>
      </p>
      <meta httpEquiv="refresh" content="5" />
      {viewerCase.findings.length === 0 ? (
        <p style={waitingStyle}>Warte auf freigegebene Befunde…</p>
      ) : (
        <section aria-label="Freigegebene Befunde">
          <h2>Befunde</h2>
          <ol style={{ listStyle: "none", padding: 0 }}>
            {viewerCase.findings.map((finding) => (
              <li key={finding.id} style={feedItemStyle}>
                <strong>{finding.name}</strong>
                {finding.note ? <p>{finding.note}</p> : null}
                <p style={{ color: "#57606a", fontSize: "0.85rem" }}>
                  Freigegeben um{" "}
                  <time dateTime={finding.releasedAt.toISOString()}>
                    {timeFormat.format(finding.releasedAt)}
                  </time>{" "}
                  Uhr
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
