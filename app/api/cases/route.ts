import { NextResponse } from "next/server";

import { caseTypeExists, createCase } from "@/lib/cases";

const SEE_OTHER = 303;

function redirectToError(origin: string, message: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/?error=${encodeURIComponent(message)}`, origin),
    SEE_OTHER,
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const caseTypeId = String(formData.get("caseTypeId") ?? "").trim();
  const origin = new URL(request.url).origin;

  if (name === "") {
    return redirectToError(origin, "Bitte gib einen Fallnamen ein.");
  }

  if (!(await caseTypeExists(caseTypeId))) {
    return redirectToError(origin, "Unbekannter Falltyp.");
  }

  const cockpitId = await createCase({ name, caseTypeId });

  return NextResponse.redirect(
    new URL(`/cockpit/${cockpitId}`, origin),
    SEE_OTHER,
  );
}
