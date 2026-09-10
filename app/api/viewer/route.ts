import { NextResponse } from "next/server";

import { formatCaseCode, normalizeCode } from "@/lib/case-code";
import { getCaseByCode } from "@/lib/cases";
import { createRateLimiter } from "@/lib/rate-limit";
import { redirectTo } from "@/lib/redirect";

const joinLimiter = createRateLimiter(60, 30, "ratelimit:viewer:join");

export async function POST(request: Request): Promise<NextResponse> {
  const { allowed } = await joinLimiter.check(request);
  if (!allowed) {
    return redirectTo(
      "/viewer?error=" +
        encodeURIComponent(
          "Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.",
        ),
    );
  }

  const formData = await request.formData();
  const rawCode = String(formData.get("code") ?? "").trim();

  const code = normalizeCode(rawCode);

  if (code === "") {
    return redirectTo(
      "/viewer?error=" + encodeURIComponent("Bitte gib einen Fallcode ein."),
    );
  }

  const viewerCase = await getCaseByCode(code);

  if (!viewerCase) {
    return redirectTo(
      "/viewer?error=" +
        encodeURIComponent("Fallcode nicht gefunden. Bitte versuche es erneut."),
    );
  }

  return redirectTo(`/viewer/${formatCaseCode(code)}`);
}
