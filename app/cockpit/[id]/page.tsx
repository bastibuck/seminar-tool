import { notFound } from "next/navigation";

import { formatCaseCode } from "@/lib/case-code";
import { getCaseOverview } from "@/lib/cases";

import { ReleaseDialog } from "./release-dialog";

export const dynamic = "force-dynamic";

type CockpitPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

const COCKPIT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pageStyle = {
  fontFamily: "system-ui, sans-serif",
  maxWidth: "40rem",
  margin: "0 auto",
  padding: "2rem",
} as const;

const codeStyle = {
  fontSize: "1.5rem",
  letterSpacing: "0.1em",
  fontWeight: 700,
} as const;

const releasedBadgeStyle = {
  color: "#1a7f37",
  fontWeight: 600,
} as const;

const heldBackBadgeStyle = {
  color: "#57606a",
} as const;

const endedNoteStyle = {
  marginTop: "1.5rem",
  color: "#57606a",
} as const;

const endButtonStyle = {
  marginTop: "2rem",
  padding: "0.6rem 1.2rem",
  fontSize: "1rem",
  cursor: "pointer",
} as const;

const releaseTimeFormat = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Europe/Berlin",
});

export default async function CockpitPage({
  params,
  searchParams,
}: CockpitPageProps) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);

  if (!COCKPIT_ID_PATTERN.test(id)) notFound();

  const overview = await getCaseOverview(id);
  if (!overview) notFound();

  return (
    <main style={pageStyle}>
      <p>Cockpit</p>
      <h1>{overview.name}</h1>
      <p>
        Fallcode für die Studierenden:{" "}
        <strong style={codeStyle}>{formatCaseCode(overview.code)}</strong>
      </p>
      {error ? (
        <p role="alert" style={{ color: "#b00020" }}>
          {error}
        </p>
      ) : null}
      <section aria-label="Befunde">
        <h2>Befunde</h2>
        <ol>
          {overview.findings.map((finding) => (
            <li key={finding.id} data-finding-id={finding.id}>
              <strong>{finding.name}</strong>
              {finding.releasedAt ? (
                <p style={releasedBadgeStyle}>
                  Freigegeben um{" "}
                  <time dateTime={finding.releasedAt.toISOString()}>
                    {releaseTimeFormat.format(finding.releasedAt)}
                  </time>{" "}
                  Uhr
                </p>
              ) : (
                <p style={heldBackBadgeStyle}>Zurückgehalten</p>
              )}
              {!overview.endedAt ? (
                finding.releasedAt ? (
                  <form method="post" action={`/api/cases/${id}/releases`}>
                    <input type="hidden" name="findingId" value={finding.id} />
                    <input type="hidden" name="intent" value="unrelease" />
                    <button type="submit">Zurückziehen</button>
                  </form>
                ) : (
                  <ReleaseDialog
                    cockpitId={id}
                    findingId={finding.id}
                    findingName={finding.name}
                  />
                )
              ) : null}
            </li>
          ))}
        </ol>
      </section>
      {overview.endedAt ? (
        <p style={endedNoteStyle}>
          Beendet um{" "}
          <time dateTime={overview.endedAt.toISOString()}>
            {releaseTimeFormat.format(overview.endedAt)}
          </time>{" "}
          Uhr – es können keine Befunde mehr freigegeben oder zurückgezogen
          werden.
        </p>
      ) : (
        <form method="get" action={`/cockpit/${id}/end`}>
          <button type="submit" style={endButtonStyle}>
            Fall beenden
          </button>
        </form>
      )}
    </main>
  );
}
