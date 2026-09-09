import { NextResponse } from "next/server";

const SEE_OTHER = 303;

export function redirectTo(location: string): NextResponse {
  return new NextResponse(null, {
    status: SEE_OTHER,
    headers: { Location: location },
  });
}