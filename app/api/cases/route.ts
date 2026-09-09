import { NextResponse } from "next/server";

import { caseTypeExists, createCase } from "@/lib/cases";
import { mutationsDisabledResponse, mutationsEnabled } from "@/lib/mutation-safety";
import { redirectTo } from "@/lib/redirect";

function redirectToError(message: string): NextResponse {
  return redirectTo(`/?error=${encodeURIComponent(message)}`);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!mutationsEnabled()) return mutationsDisabledResponse();

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const caseTypeId = String(formData.get("caseTypeId") ?? "").trim();

  if (name === "") {
    return redirectToError("Bitte gib einen Fallnamen ein.");
  }

  if (!(await caseTypeExists(caseTypeId))) {
    return redirectToError("Unbekannter Falltyp.");
  }

  const cockpitId = await createCase({ name, caseTypeId });

  return redirectTo(`/cockpit/${cockpitId}`);
}
