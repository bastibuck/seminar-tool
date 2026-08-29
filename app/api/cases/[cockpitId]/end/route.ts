import { NextResponse } from "next/server";

import { endCase } from "@/lib/cases";

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
  const origin = new URL(request.url).origin;

  const result = await endCase(cockpitId);

  if (result === "unknown-case") {
    return redirectToError(origin, "/", "Fall nicht gefunden.");
  }

  return NextResponse.redirect(
    new URL(`/cockpit/${cockpitId}`, origin),
    SEE_OTHER,
  );
}