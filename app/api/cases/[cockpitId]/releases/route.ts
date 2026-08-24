import { NextResponse } from "next/server";

import { setFindingReleased } from "@/lib/cases";

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
  const intent = String(formData.get("intent") ?? "").trim();
  const origin = new URL(request.url).origin;

  if (intent !== "release" && intent !== "unrelease") {
    return redirectToError(origin, `/cockpit/${cockpitId}`, "Ungültige Aktion.");
  }

  const result = await setFindingReleased({
    cockpitId,
    findingId,
    released: intent === "release",
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
