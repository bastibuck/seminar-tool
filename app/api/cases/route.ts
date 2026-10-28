import { NextResponse } from "next/server";

import { caseTypeExists, createCase } from "@/lib/cases";
import { redirectTo } from "@/lib/redirect";
import { requireInstructorApi, withInstructorDeadline } from "@/lib/instructor-auth";

function redirectToError(message: string): NextResponse {
  return redirectTo(`/?error=${encodeURIComponent(message)}`);
}

async function post(request: Request): Promise<NextResponse> {
  const denied = await requireInstructorApi(request);
  if (denied) return denied;
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

export const POST = withInstructorDeadline(post);
