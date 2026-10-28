import { NextResponse } from "next/server";

import {
  createCaseType,
  deleteCaseType,
  renameCaseType,
} from "@/lib/admin";
import { listCaseTypes } from "@/lib/cases";
import { requireInstructorApi, withInstructorDeadline } from "@/lib/instructor-auth";

import { jsonError } from "../http";

export async function GET(request: Request): Promise<NextResponse> {
  const denied = await requireInstructorApi(request);
  if (denied) return denied;
  const caseTypes = await listCaseTypes();
  return NextResponse.json({ ok: true, caseTypes });
}

async function post(request: Request): Promise<NextResponse> {
  const denied = await requireInstructorApi(request);
  if (denied) return denied;
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const result = await createCaseType(name);
  switch (result.status) {
    case "empty-name":
      return jsonError("Bitte gib einen Namen ein.", 400);
    case "duplicate-name":
      return jsonError(
        "Ein Falltyp mit diesem Namen existiert bereits.",
        409,
      );
    case "ok":
      return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
  }
}

async function put(request: Request): Promise<NextResponse> {
  const denied = await requireInstructorApi(request);
  if (denied) return denied;
  const formData = await request.formData();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const result = await renameCaseType(id, name);
  switch (result.status) {
    case "empty-name":
      return jsonError("Bitte gib einen Namen ein.", 400);
    case "unknown-type":
      return jsonError("Falltyp nicht gefunden.", 404);
    case "duplicate-name":
      return jsonError(
        "Ein Falltyp mit diesem Namen existiert bereits.",
        409,
      );
    case "ok":
      return NextResponse.json({ ok: true });
  }
}

async function remove(request: Request): Promise<NextResponse> {
  const denied = await requireInstructorApi(request);
  if (denied) return denied;
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

export const POST = withInstructorDeadline(post);
export const PUT = withInstructorDeadline(put);
export const DELETE = withInstructorDeadline(remove);
