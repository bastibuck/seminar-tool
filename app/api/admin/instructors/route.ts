import { NextResponse } from "next/server";
import { z } from "zod";

import { canCreateInstructors, createInstructor, validTemporaryPassword } from "@/lib/instructor-creation";
import { currentInstructor, requireInstructorApi, withInstructorDeadline } from "@/lib/instructor-auth";

const emailSchema = z.email();
const genericError = "Die Kursleitung konnte nicht angelegt werden. Bitte wende dich an die Administration.";

async function post(request: Request): Promise<NextResponse> {
  const denied = await requireInstructorApi(request);
  if (denied) return denied;
  const instructor = await currentInstructor();
  if (!instructor || instructor.setup_required) return NextResponse.json({ ok: false, error: "Bitte melde dich an." }, { status: 401 });
  if (!(await canCreateInstructors(instructor.user_id))) return NextResponse.json({ ok: false, error: "Keine Berechtigung." }, { status: 403 });

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!emailSchema.safeParse(email).success) return NextResponse.json({ ok: false, error: "Bitte gib eine gültige E-Mail-Adresse ein." }, { status: 400 });
  if (!validTemporaryPassword(password)) {
    const error = [...password].length < 12
      ? "Das Passwort muss mindestens 12 Zeichen lang sein."
      : "Das Passwort ist zu lang. Bitte verwende ein kürzeres Passwort.";
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }

  try {
    const created = await createInstructor({ creatorId: instructor.user_id, sessionKey: instructor.session_key, email, password });
    if (created) return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    // Never log a request or its credentials; keep account-existence private.
  }
  return NextResponse.json({ ok: false, error: genericError }, { status: 400 });
}

export const POST = withInstructorDeadline(post);
