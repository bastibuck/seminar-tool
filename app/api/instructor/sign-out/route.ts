import { NextResponse } from "next/server";

import { sameOrigin, signOut } from "@/lib/instructor-auth";
import { redirectTo } from "@/lib/redirect";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  const form = await request.formData();
  const signedOut = await signOut(String(form.get("session") ?? ""));
  return redirectTo(signedOut ? "/sign-in" : "/");
}
