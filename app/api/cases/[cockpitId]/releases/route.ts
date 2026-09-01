import { NextResponse } from "next/server";

import { setFindingReleased, type ReleaseIntent } from "@/lib/cases";

type RouteContext = {
  params: Promise<{ cockpitId: string }>;
};

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { cockpitId } = await context.params;
  const formData = await request.formData();
  const findingId = String(formData.get("findingId") ?? "").trim();
  const intentValue = String(formData.get("intent") ?? "").trim();
  const noteValue = String(formData.get("note") ?? "").trim() || null;

  if (intentValue !== "release" && intentValue !== "unrelease") {
    return jsonError("Ungültige Aktion.", 400);
  }
  const intent: ReleaseIntent = intentValue;

  const result = await setFindingReleased({
    cockpitId,
    findingId,
    intent,
    note: intent === "release" ? noteValue : null,
  });

  if (result.status === "unknown-case") {
    return jsonError("Fall nicht gefunden.", 404);
  }
  if (result.status === "ended") {
    return jsonError("Fall bereits beendet.", 409);
  }
  if (result.status === "unknown-finding") {
    return jsonError("Befund nicht gefunden.", 404);
  }

  return NextResponse.json({
    ok: true,
    releasedAt: result.releasedAt ? result.releasedAt.toISOString() : null,
  });
}
