import { notFound } from "next/navigation";

import { formatCaseCode } from "@/lib/case-code";
import { getCaseOverview } from "@/lib/cases";

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
              {finding.note ? <p>{finding.note}</p> : null}
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
              <form method="post" action={`/api/cases/${id}/releases`}>
                <input type="hidden" name="findingId" value={finding.id} />
                <input
                  type="hidden"
                  name="intent"
                  value={finding.releasedAt ? "unrelease" : "release"}
                />
                <button type="submit">
                  {finding.releasedAt ? "Zurückziehen" : "Freigeben"}
                </button>
              </form>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
