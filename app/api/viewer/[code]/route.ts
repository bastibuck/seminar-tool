import { NextResponse } from "next/server";

import { getCaseByCode } from "@/lib/cases";
import { normalizeCode } from "@/lib/case-code";

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
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
    findings: viewerCase.findings.map((f) => ({
      id: f.id,
      name: f.name,
      note: f.note,
      releasedAt: f.releasedAt.toISOString(),
    })),
  });
}
