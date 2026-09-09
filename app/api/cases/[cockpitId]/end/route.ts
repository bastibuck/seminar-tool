import { NextResponse } from "next/server";

import { notifyViewerOfChange } from "@/lib/broadcast";
import { endCase } from "@/lib/cases";
import { mutationsDisabledResponse, mutationsEnabled } from "@/lib/mutation-safety";

type RouteContext = {
  params: Promise<{ cockpitId: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  if (!mutationsEnabled()) return mutationsDisabledResponse();

  const { cockpitId } = await context.params;

  const result = await endCase(cockpitId);

  if (result.status === "unknown-case") {
    return NextResponse.json(
      { ok: false, error: "Fall nicht gefunden." },
      { status: 404 },
    );
  }

  notifyViewerOfChange(result.caseId);

  return NextResponse.json({
    ok: true,
    endedAt: result.endedAt.toISOString(),
  });
}
