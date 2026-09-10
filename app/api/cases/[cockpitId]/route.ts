import { NextResponse } from "next/server";

import { getCaseOverview } from "@/lib/cases";
import { createRateLimiter } from "@/lib/rate-limit";

type RouteContext = {
  params: Promise<{ cockpitId: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const cockpitReadLimiter = await createRateLimiter("cockpit:read", 120, 60);
  const { allowed } = await cockpitReadLimiter.check(request);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "Zu viele Anfragen. Bitte warte einen Moment." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

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
