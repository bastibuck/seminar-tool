import { NextResponse } from "next/server";

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}
