import { NextResponse } from "next/server";

import { setFindingReleased, type ReleaseIntent } from "@/lib/cases";

const SEE_OTHER = 303;

type RouteContext = {
  params: Promise<{ cockpitId: string }>;
};

function redirectToError(
  origin: string,
  path: string,
  message: string,
): NextResponse {
  return NextResponse.redirect(
    new URL(`${path}?error=${encodeURIComponent(message)}`, origin),
    SEE_OTHER,
  );
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { cockpitId } = await context.params;
  const formData = await request.formData();
  const findingId = String(formData.get("findingId") ?? "").trim();
  const intentValue = String(formData.get("intent") ?? "").trim();
  const origin = new URL(request.url).origin;

  if (intentValue !== "release" && intentValue !== "unrelease") {
    return redirectToError(origin, `/cockpit/${cockpitId}`, "Ungültige Aktion.");
  }
  const intent: ReleaseIntent = intentValue;

  const result = await setFindingReleased({
    cockpitId,
    findingId,
    intent,
  });

  if (result === "unknown-case") {
    return redirectToError(origin, "/", "Fall nicht gefunden.");
  }
  if (result === "unknown-finding") {
    return redirectToError(
      origin,
      `/cockpit/${cockpitId}`,
      "Befund nicht gefunden.",
    );
  }

  return NextResponse.redirect(
    new URL(`/cockpit/${cockpitId}`, origin),
    SEE_OTHER,
  );
}
