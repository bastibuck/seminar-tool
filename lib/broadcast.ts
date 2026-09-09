import { createClient } from "@supabase/supabase-js";

import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./supabase-config";

export const VIEWER_BROADCAST_EVENT = "changed";

export function viewerBroadcastChannel(caseId: string): string {
  return `viewer-${caseId}`;
}

export function notifyViewerOfChange(caseId: string): void {
  const supabase = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey());
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
          // Best-effort notification; the viewer's Postgres Changes
          // subscription remains as a fallback while both paths coexist.
        })
        .then(() => {
          // Defer cleanup off the channel's own callback stack to avoid
          // re-entering its unsubscribe path synchronously.
          setTimeout(() => supabase.removeChannel(channel), 0);
        });
    }
  });
}
