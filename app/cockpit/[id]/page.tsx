import { notFound } from "next/navigation";

import { formatCaseCode } from "@/lib/case-code";
import { getCaseOverview } from "@/lib/cases";

import { CockpitClient } from "./cockpit-client";

export const dynamic = "force-dynamic";

type CockpitPageProps = {
  params: Promise<{ id: string }>;
};

const COCKPIT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CockpitPage({
  params,
}: CockpitPageProps) {
  const { id } = await params;

  if (!COCKPIT_ID_PATTERN.test(id)) notFound();

  const overview = await getCaseOverview(id);
  if (!overview) notFound();

  return (
    <main className="shell">
      <p className="eyebrow">Cockpit</p>
      <h1>{overview.name}</h1>
      <p>
        Fallcode für die Studierenden:{" "}
        <strong className="code">{formatCaseCode(overview.code)}</strong>
      </p>
      <CockpitClient
        cockpitId={id}
        endedAt={overview.endedAt ? overview.endedAt.toISOString() : null}
        findings={overview.findings.map((finding) => ({
          id: finding.id,
          name: finding.name,
          releasedAt: finding.releasedAt
            ? finding.releasedAt.toISOString()
            : null,
        }))}
      />
    </main>
  );
}
