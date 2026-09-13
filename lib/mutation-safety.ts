import { NextResponse } from "next/server";

export function mutationsDisabledResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Mutationen sind derzeit deaktiviert." },
    { status: 503 },
  );
}
