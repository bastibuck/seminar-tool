import { notFound } from "next/navigation";

import { getCaseOverview } from "@/lib/cases";
import { formatShortCode } from "@/lib/short-code";

export const dynamic = "force-dynamic";

type CockpitPageProps = {
  params: Promise<{ id: string }>;
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

export default async function CockpitPage({ params }: CockpitPageProps) {
  const { id } = await params;

  if (!COCKPIT_ID_PATTERN.test(id)) notFound();

  const overview = await getCaseOverview(id);
  if (!overview) notFound();

  return (
    <main style={pageStyle}>
      <p>Cockpit</p>
      <h1>{overview.name}</h1>
      <p>
        Fallcode für die Studierenden:{" "}
        <strong style={codeStyle}>{formatShortCode(overview.code)}</strong>
      </p>
      <section aria-label="Befunde">
        <h2>Befunde</h2>
        <ol>
          {overview.findings.map((finding) => (
            <li key={finding.id}>
              <strong>{finding.name}</strong>
              {finding.note ? <p>{finding.note}</p> : null}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
