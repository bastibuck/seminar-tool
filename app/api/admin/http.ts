import { NextResponse } from "next/server";

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function isLargerThanBytes(request: Request, maxBytes: number): boolean {
  const contentLength = Number(request.headers.get("content-length"));
  return !Number.isNaN(contentLength) && contentLength > maxBytes;
}
