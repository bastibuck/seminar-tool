import { NextResponse } from "next/server";

import {
  createCaseType,
  deleteCaseType,
  renameCaseType,
} from "@/lib/admin";
import { listCaseTypes } from "@/lib/cases";

import { jsonError } from "../http";

export async function GET(): Promise<NextResponse> {
  const caseTypes = await listCaseTypes();
  return NextResponse.json({ ok: true, caseTypes });
}

export async function POST(request: Request): Promise<NextResponse> {
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const result = await createCaseType(name);
  switch (result.status) {
    case "empty-name":
      return jsonError("Bitte gib einen Namen ein.", 400);
    case "ok":
      return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  const formData = await request.formData();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const result = await renameCaseType(id, name);
  switch (result.status) {
    case "empty-name":
      return jsonError("Bitte gib einen Namen ein.", 400);
    case "unknown-type":
      return jsonError("Falltyp nicht gefunden.", 404);
    case "ok":
      return NextResponse.json({ ok: true });
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const formData = await request.formData();
  const id = String(formData.get("id") ?? "").trim();
  const result = await deleteCaseType(id);
  switch (result.status) {
    case "unknown-type":
      return jsonError("Falltyp nicht gefunden.", 404);
    case "referenced":
      return jsonError(
        `Falltyp wird noch von „${result.caseName}" verwendet und kann nicht gelöscht werden.`,
        409,
      );
    case "ok":
      return NextResponse.json({ ok: true });
  }
}
