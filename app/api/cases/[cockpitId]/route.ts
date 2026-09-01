import { NextResponse } from "next/server";

import { getCaseOverview } from "@/lib/cases";

type RouteContext = {
  params: Promise<{ cockpitId: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { cockpitId } = await context.params;

  const overview = await getCaseOverview(cockpitId);
  if (!overview) {
    return NextResponse.json(
      { ok: false, error: "Fall nicht gefunden." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    name: overview.name,
    code: overview.code,
    endedAt: overview.endedAt ? overview.endedAt.toISOString() : null,
    findings: overview.findings.map((finding) => ({
      id: finding.id,
      name: finding.name,
      releasedAt: finding.releasedAt
        ? finding.releasedAt.toISOString()
        : null,
    })),
  });
}
