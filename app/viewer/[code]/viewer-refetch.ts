import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";

export const VIEWER_FALLBACK_REFETCH_INTERVAL_MS = 5000;

export function shouldUseFallbackRefetch(
  channelStatus: REALTIME_SUBSCRIBE_STATES | undefined,
  ended: boolean,
): boolean {
  return (
    !ended && channelStatus !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED
  );
}