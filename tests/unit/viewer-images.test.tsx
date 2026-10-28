// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/broadcast", () => ({ VIEWER_BROADCAST_EVENT: "changed", viewerBroadcastChannel: () => "viewer-test" }));
vi.mock("../../lib/supabase-browser", () => ({
  getSupabaseBrowserClient: () => ({
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  }),
}));

import { ViewerRealtime } from "../../app/viewer/[code]/viewer-realtime";

describe("Viewer finding images", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows an unavailable image message instead of rendering an empty image URL", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(
      <QueryClientProvider client={queryClient}>
        <ViewerRealtime caseId="case" caseCode="ABCD-2345" initialEnded={false} initialFindings={[
          { id: "finding", name: "12-Kanal-EKG", note: null, releasedAt: new Date("2026-10-28T19:56:56Z"), imageUrl: "" },
        ]} />
      </QueryClientProvider>,
    ));

    expect(errors.mock.calls.flat().join(" ")).not.toContain('An empty string ("") was passed');
    expect(container.textContent).toContain("12-Kanal-EKG");
    expect(container.textContent).toContain("Bild nicht verfügbar");
    expect(container.querySelector("img")).toBeNull();

    act(() => root.unmount());
    queryClient.clear();
  });

  it("shows a fallback if an image fails to load and retries when a fresh URL arrives", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(
      <QueryClientProvider client={queryClient}>
        <ViewerRealtime caseId="case" caseCode="ABCD-2345" initialEnded={false} initialFindings={[
          { id: "finding", name: "12-Kanal-EKG", note: null, releasedAt: new Date("2026-10-28T19:56:56Z"), imageUrl: "https://example.test/old" },
        ]} />
      </QueryClientProvider>,
    ));

    const image = container.querySelector("img")!;
    expect(image.getAttribute("alt")).toBe("12-Kanal-EKG");
    act(() => image.dispatchEvent(new Event("error")));
    expect(container.textContent).toContain("Bild nicht verfügbar");
    expect(container.querySelector("img")).toBeNull();

    await act(async () => {
      queryClient.setQueryData(["viewer", "ABCD-2345"], {
        ended: false,
        findings: [{ id: "finding", name: "12-Kanal-EKG", note: null, releasedAt: "2026-10-28T19:56:56Z", imageUrl: "https://example.test/new" }],
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.test/new");

    act(() => root.unmount());
    queryClient.clear();
  });
});
