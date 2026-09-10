import { NextResponse } from "next/server";

import { getCaseByCode } from "@/lib/cases";
import { normalizeCode } from "@/lib/case-code";
import { createRateLimiter } from "@/lib/rate-limit";

const viewerReadLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 300,
});

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { allowed } = viewerReadLimiter.check(_request);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "Zu viele Anfragen. Bitte warte einen Moment." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const { code: rawCode } = await context.params;
  const code = normalizeCode(rawCode);

  const viewerCase = await getCaseByCode(code);
  if (!viewerCase) {
    return NextResponse.json(
      { error: "Fallcode nicht gefunden." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    name: viewerCase.name,
    ended: viewerCase.endedAt !== null,
    findings: viewerCase.findings.map((f) => ({
      id: f.id,
      name: f.name,
      note: f.note,
      releasedAt: f.releasedAt.toISOString(),
      imageUrl: f.imageUrl,
    })),
  });
}
