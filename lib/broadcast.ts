import { createClient } from "@supabase/supabase-js";

import { env } from "./env";

export const VIEWER_BROADCAST_EVENT = "changed";

export function viewerBroadcastChannel(caseId: string): string {
  return `viewer-${caseId}`;
}

export async function notifyViewerOfChange(caseId: string): Promise<void> {
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const channel = supabase.channel(viewerBroadcastChannel(caseId));

  try {
    // Publish over the Realtime REST endpoint instead of opening a WebSocket:
    // a single awaited HTTP request has no join handshake or long-lived
    // socket for a serverless function to be frozen in. httpSend resolves
    // with {success:true} only after the Realtime server accepted the
    // message, and rejects on failure, so callers await it and surface
    // errors instead of firing-and-forgetting.
    await channel.httpSend(VIEWER_BROADCAST_EVENT, {
      type: "changed",
    });
  } finally {
    void supabase.removeChannel(channel);
  }
}