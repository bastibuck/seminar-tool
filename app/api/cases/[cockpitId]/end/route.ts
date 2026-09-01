import { NextResponse } from "next/server";

import { endCase } from "@/lib/cases";

type RouteContext = {
  params: Promise<{ cockpitId: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { cockpitId } = await context.params;

  const result = await endCase(cockpitId);

  if (result === "unknown-case") {
    return NextResponse.json(
      { ok: false, error: "Fall nicht gefunden." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
