import { NextResponse } from "next/server";

import { formatCaseCode, normalizeCode } from "@/lib/case-code";
import { getCaseByCode } from "@/lib/cases";

const SEE_OTHER = 303;

export async function POST(request: Request): Promise<NextResponse> {
  const formData = await request.formData();
  const rawCode = String(formData.get("code") ?? "").trim();
  const origin = new URL(request.url).origin;

  const code = normalizeCode(rawCode);

  if (code === "") {
    return NextResponse.redirect(
      new URL("/viewer?error=" + encodeURIComponent("Bitte gib einen Fallcode ein."), origin),
      SEE_OTHER,
    );
  }

  const viewerCase = await getCaseByCode(code);

  if (!viewerCase) {
    return NextResponse.redirect(
      new URL(
        "/viewer?error=" +
          encodeURIComponent("Fallcode nicht gefunden. Bitte versuche es erneut."),
        origin,
      ),
      SEE_OTHER,
    );
  }

  return NextResponse.redirect(
    new URL(`/viewer/${formatCaseCode(code)}`, origin),
    SEE_OTHER,
  );
}
