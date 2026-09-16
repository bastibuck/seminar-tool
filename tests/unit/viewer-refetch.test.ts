import { describe, expect, it } from "vitest";

import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";

import { shouldUseFallbackRefetch } from "../../app/viewer/[code]/viewer-refetch";

describe("shouldUseFallbackRefetch", () => {
  it("refetches while the channel has not reported a status yet", () => {
    expect(shouldUseFallbackRefetch(undefined, false)).toBe(true);
  });

  it.each([
    ["TIMED_OUT", REALTIME_SUBSCRIBE_STATES.TIMED_OUT],
    ["CLOSED", REALTIME_SUBSCRIBE_STATES.CLOSED],
    ["CHANNEL_ERROR", REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR],
  ])("resumes refetching after a non-SUBSCRIBED state (%s)", (_label, status) => {
    expect(shouldUseFallbackRefetch(status, false)).toBe(true);
  });

  it("stops refetching once the channel confirms SUBSCRIBED", () => {
    expect(
      shouldUseFallbackRefetch(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED, false),
    ).toBe(false);
  });

  it("stops refetching once the case ended, even while the channel is unhealthy", () => {
    expect(shouldUseFallbackRefetch(undefined, true)).toBe(false);
    expect(
      shouldUseFallbackRefetch(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, true),
    ).toBe(false);
    expect(
      shouldUseFallbackRefetch(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED, true),
    ).toBe(false);
  });
});