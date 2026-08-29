import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect } from "vitest";

import {
  connectTestDb,
  createCase,
  extractCaseTypeId,
  getStartPage,
} from "./cases";
import { BASE_URL } from "../setup/server-address";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

export const REALTIME_PING_TIMEOUT_MS = 1500;
export const REALTIME_PING_ATTEMPTS = 20;

let realtimeWarmedUp = false;

// The local Supabase Realtime service drops row changes emitted during the
// first ~1-2s after its replication slot attaches (most visible right after
// `supabase db reset`, where the very first release event never arrives).
// Pinging until a deliverable event is received proves the pipeline is live,
// so latency assertions in the realtime integration tests measure a working
// subscription instead of the attach window. Idempotent per process.
export async function ensureRealtimeLive(): Promise<void> {
  if (realtimeWarmedUp) return;
  realtimeWarmedUp = true;

  const caseTypeId = extractCaseTypeId(await getStartPage());
  const createResponse = await createCase({
    caseTypeId,
    name: "Realtime Warmup",
  });
  expect(createResponse.status).toBe(303);
  const cockpitUrl = createResponse.headers.get("location")!;
  const cockpitId = cockpitUrl.split("/").pop()!;

  const db = connectTestDb();
  const rows = await db<{ id: string; caseTypeId: string }[]>`
    select id, case_type_id as "caseTypeId"
    from cases
    where cockpit_id = ${cockpitId}
  `;
  const caseId = rows[0]!.id;
  const caseTypeIdOfCase = rows[0]!.caseTypeId;

  const findingRows = await db<{ id: string }[]>`
    select id
    from findings
    where case_type_id = ${caseTypeIdOfCase}
    order by position
    limit 1
  `;
  const findingId = findingRows[0]!.id;
  await db.end();

  const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const events: unknown[] = [];

  let resolveSubscribed!: () => void;
  const subscribed = new Promise<void>((resolve) => {
    resolveSubscribed = resolve;
  });

  const channel = supabase
    .channel(`realtime-warmup-${caseId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "releases",
        filter: `case_id=eq.${caseId}`,
      },
      (payload) => {
        events.push(payload);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") resolveSubscribed();
    });

  await subscribed;

  const toggle = async (intent: "release" | "unrelease") => {
    await fetch(`${BASE_URL}/api/cases/${cockpitId}/releases`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        findingId,
        intent,
      }).toString(),
      redirect: "manual",
    });
  };

  let received = false;
  for (let attempt = 0; attempt < REALTIME_PING_ATTEMPTS; attempt++) {
    await toggle(attempt % 2 === 0 ? "release" : "unrelease");
    const deadline = Date.now() + REALTIME_PING_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (
        events.some((event) => (event as { eventType: string }).eventType === "INSERT")
      ) {
        received = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (received) break;
  }

  supabase.removeChannel(channel);

  if (!received) {
    throw new Error("Realtime pipeline never became live within the warm-up window");
  }
}