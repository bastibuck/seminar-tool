import { NextResponse } from "next/server";

import {
  createFinding,
  deleteFinding,
  getCaseTypeDetail,
  renameFinding,
  swapFindings,
} from "@/lib/admin";

import { jsonError } from "../../http";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const detail = await getCaseTypeDetail(id);
  if (!detail) return jsonError("Falltyp nicht gefunden.", 404);
  return NextResponse.json({
    ok: true,
    caseTypeId: id,
    name: detail.name,
    findings: detail.findings,
  });
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();

  const result = await createFinding(id, name);
  switch (result.status) {
    case "empty-name":
      return jsonError("Bitte gib einen Namen ein.", 400);
    case "unknown-type":
      return jsonError("Falltyp nicht gefunden.", 404);
    case "duplicate-name":
      return jsonError("Ein Befund mit diesem Namen existiert bereits.", 409);
    case "ok":
      return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const formData = await request.formData();
  const findingId = String(formData.get("findingId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  const result = await renameFinding(findingId, name);
  switch (result.status) {
    case "empty-name":
      return jsonError("Bitte gib einen Namen ein.", 400);
    case "unknown-finding":
      return jsonError("Befund nicht gefunden.", 404);
    case "duplicate-name":
      return jsonError("Ein Befund mit diesem Namen existiert bereits.", 409);
    case "ok":
      return NextResponse.json({ ok: true });
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const formData = await request.formData();
  const findingId = String(formData.get("findingId") ?? "").trim();

  const result = await deleteFinding(findingId);
  switch (result.status) {
    case "unknown-finding":
      return jsonError("Befund nicht gefunden.", 404);
    case "referenced":
      return jsonError(
        `Dieser Befund wurde im Fall „${result.caseName}" bereits freigegeben und kann daher nicht gelöscht werden.`,
        409,
      );
    case "ok":
      return NextResponse.json({ ok: true });
  }
}

export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const formData = await request.formData();
  const findingA = String(formData.get("findingA") ?? "").trim();
  const findingB = String(formData.get("findingB") ?? "").trim();

  const result = await swapFindings(id, findingA, findingB);
  switch (result.status) {
    case "invalid-swap":
      return jsonError("Ungültige Vertauschung.", 400);
    case "unknown-type":
      return jsonError("Falltyp nicht gefunden.", 404);
    case "ok":
      return NextResponse.json({ ok: true });
  }
}
