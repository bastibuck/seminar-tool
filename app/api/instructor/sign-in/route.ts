import { NextResponse } from "next/server";
import { safeDestination, sameOrigin, setSessionCookie, signIn } from "@/lib/instructor-auth";
import { redirectTo } from "@/lib/redirect";
import { createRateLimiter, rateLimitExceededResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  const limiter = await createRateLimiter("instructor:sign-in", 20, 60);
  if (!(await limiter.check(request)).allowed) return rateLimitExceededResponse();
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const destination = safeDestination(String(form.get("next") ?? "/"));
  const session = await signIn(email, password);
  if (!session) return redirectTo(`/sign-in?next=${encodeURIComponent(destination)}&error=${encodeURIComponent("Anmeldung nicht möglich. Prüfe deine Zugangsdaten oder wende dich an die Administration.")}`);
  await setSessionCookie(session.token);
  return redirectTo(session.setupRequired ? "/password-setup" : destination);
}
