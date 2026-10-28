import { NextResponse } from "next/server";

import { isLargerThanBytes } from "../../http";
import { findingNameIsAvailable, getFinding, renameFinding, replaceFindingImage } from "@/lib/admin";
import { FINDING_IMAGE_REQUEST_MAX_BYTES, processFindingImage } from "@/lib/finding-image";
import { requireInstructorApi, withInstructorDeadline } from "@/lib/instructor-auth";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const denied = await requireInstructorApi(request);
  if (denied) return denied;
  const finding = await getFinding((await context.params).id);
  if (!finding) return NextResponse.json({ error: "Befund nicht gefunden." }, { status: 404 });
  return NextResponse.json({ ok: true, finding: { id: finding.id, caseTypeId: finding.caseTypeId, name: finding.name } });
}

async function patch(request: Request, context: Context) {
  const denied = await requireInstructorApi(request);
  if (denied) return denied;
  const id = (await context.params).id;
  if (isLargerThanBytes(request, FINDING_IMAGE_REQUEST_MAX_BYTES)) {
    return NextResponse.json({ error: "Die Anfrage ist zu groß." }, { status: 413 });
  }
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "");
  const image = formData.get("image");
  const nameCheck = await findingNameIsAvailable(id, name);
  if (nameCheck.status === "unknown-finding") return NextResponse.json({ error: "Befund nicht gefunden." }, { status: 404 });
  if (nameCheck.status === "empty-name") return NextResponse.json({ error: "Bitte gib einen Namen ein." }, { status: 400 });
  if (nameCheck.status === "duplicate-name") return NextResponse.json({ error: "Ein Befund mit diesem Namen existiert bereits." }, { status: 409 });
  if (image instanceof File && image.size > 0) {
    const processed = await processFindingImage(image);
    if (!processed.ok) return NextResponse.json({ error: processed.error }, { status: 400 });
    const replacement = await replaceFindingImage(id, processed);
    if (replacement === "unknown-finding") return NextResponse.json({ error: "Befund nicht gefunden." }, { status: 404 });
  }
  const result = await renameFinding(id, name);
  if (result.status === "unknown-finding") return NextResponse.json({ error: "Befund nicht gefunden." }, { status: 404 });
  if (result.status === "empty-name") return NextResponse.json({ error: "Bitte gib einen Namen ein." }, { status: 400 });
  if (result.status === "duplicate-name") return NextResponse.json({ error: "Ein Befund mit diesem Namen existiert bereits." }, { status: 409 });
  return NextResponse.json({ ok: true });
}

export const PATCH = withInstructorDeadline(patch);
