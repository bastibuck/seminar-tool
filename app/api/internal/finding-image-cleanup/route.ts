import { NextResponse } from "next/server";

import { env } from "../../../../lib/env";
import { runFindingImageCleanup } from "../../../../lib/finding-image-cleanup";

function isAuthorized(request: Request): boolean {
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runFindingImageCleanup());
}
