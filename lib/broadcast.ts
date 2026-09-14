import { createClient } from "@supabase/supabase-js";

import { env } from "./env";

export const VIEWER_BROADCAST_EVENT = "changed";

export function viewerBroadcastChannel(caseId: string): string {
  return `viewer-${caseId}`;
}

export function notifyViewerOfChange(caseId: string): void {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const channel = supabase.channel(viewerBroadcastChannel(caseId));
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      channel
        .send({
          type: "broadcast",
          event: VIEWER_BROADCAST_EVENT,
          payload: { type: "changed" },
        })
        .catch(() => {
          // Best-effort notification. Broadcast is fire-and-forget with no
          // replay: a ping sent while the viewer's websocket is (re)connecting
          // is lost. The viewer therefore polls the API as a fallback
          // (refetchInterval in ViewerRealtime), so a lost ping self-heals
          // within the poll interval instead of leaving stale state forever.
        })
        .then(() => {
          // Defer cleanup off the channel's own callback stack to avoid
          // re-entering its unsubscribe path synchronously.
          setTimeout(() => supabase.removeChannel(channel), 0);
        });
    }
  });
}
