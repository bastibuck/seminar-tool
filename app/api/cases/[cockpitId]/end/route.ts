import { NextResponse } from "next/server";

import { notifyViewerOfChange } from "@/lib/broadcast";
import { endCase } from "@/lib/cases";
import { requireInstructorApi, withInstructorDeadline } from "@/lib/instructor-auth";

type RouteContext = {
  params: Promise<{ cockpitId: string }>;
};

async function post(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const denied = await requireInstructorApi(request);
  if (denied) return denied;
  const { cockpitId } = await context.params;

  const result = await endCase(cockpitId);

  if (result.status === "unknown-case") {
    return NextResponse.json(
      { ok: false, error: "Fall nicht gefunden." },
      { status: 404 },
    );
  }

  try {
    await notifyViewerOfChange(result.caseId);
  } catch (error) {
    console.error("Broadcast to viewer failed after ending case:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Fall wurde beendet, aber die Live-Benachrichtigung ist fehlgeschlagen. Bitte Seite neu laden.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    endedAt: result.endedAt.toISOString(),
  });
}

export const POST = withInstructorDeadline(post);
