import { NextResponse } from "next/server";

export function mutationsEnabled(): boolean {
  return process.env.MUTATIONS_ENABLED === "true";
}

export function mutationsDisabledResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Mutationen sind derzeit deaktiviert." },
    { status: 503 },
  );
}
