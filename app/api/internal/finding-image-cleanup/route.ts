import { NextResponse } from "next/server";

import { runFindingImageCleanup } from "../../../../lib/finding-image-cleanup";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runFindingImageCleanup());
}
