import { NextResponse } from "next/server";
import { clearSessionCookie, completeSetup, sameOrigin, setSessionCookie, signIn } from "@/lib/instructor-auth";
import { redirectTo } from "@/lib/redirect";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  if ([...password].length < 12 || password !== String(form.get("confirmation") ?? "")) {
    return redirectTo(`/password-setup?error=${encodeURIComponent("Bitte gib zweimal dasselbe Passwort mit mindestens 12 Zeichen ein.")}`);
  }
  const completed = await completeSetup(password);
  if (!completed) return redirectTo(`/password-setup?error=${encodeURIComponent("Das Passwort konnte nicht gespeichert werden. Bitte versuche es erneut.")}`);
  await clearSessionCookie();
  const session = await signIn(completed.email, password);
  if (!session || session.setupRequired) return redirectTo("/sign-in");
  await setSessionCookie(session.token);
  return redirectTo("/");
}
