import { describe, expect, it, vi } from "vitest";

import { processFindingImageCleanup, type CleanupStore } from "../../lib/finding-image-cleanup";

function store(items: { id: string; path: string; attempts: number }[]): CleanupStore {
  return {
    claimPending: vi.fn(async () => items),
    isReferenced: vi.fn(async () => false),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
  };
}

describe("finding image cleanup", () => {
  it("deletes unreferenced items and completes already-missing objects", async () => {
    const cleanup = store([{ id: "1", path: "old.png", attempts: 1 }, { id: "2", path: "missing.png", attempts: 2 }]);
    const remove = vi.fn(async (path: string) => {
      if (path === "missing.png") return;
    });

    await expect(processFindingImageCleanup(cleanup, { remove })).resolves.toEqual({
      attempted: 2,
      cleaned: 2,
      failed: 0,
    });
    expect(cleanup.complete).toHaveBeenCalledWith("1");
    expect(cleanup.complete).toHaveBeenCalledWith("2");
  });

  it("protects a path that became referenced before cleanup", async () => {
    const cleanup = store([{ id: "1", path: "live.png", attempts: 1 }]);
    vi.mocked(cleanup.isReferenced).mockResolvedValue(true);
    const remove = vi.fn(async () => undefined);

    await expect(processFindingImageCleanup(cleanup, { remove })).resolves.toEqual({
      attempted: 1,
      cleaned: 1,
      failed: 0,
    });
    expect(remove).not.toHaveBeenCalled();
    expect(cleanup.complete).toHaveBeenCalledWith("1");
  });

  it("continues after an independent storage failure", async () => {
    const cleanup = store([{ id: "1", path: "bad.png", attempts: 1 }, { id: "2", path: "good.png", attempts: 1 }]);
    const remove = vi.fn(async (path: string) => {
      if (path === "bad.png") throw new Error("temporary failure");
    });

    await processFindingImageCleanup(cleanup, { remove });
    expect(cleanup.fail).toHaveBeenCalledWith("1", "temporary failure", expect.any(Date));
    expect(cleanup.complete).toHaveBeenCalledWith("2");
  });

  it("continues when recording a failed item also fails", async () => {
    const cleanup = store([{ id: "1", path: "bad.png", attempts: 1 }, { id: "2", path: "good.png", attempts: 1 }]);
    vi.mocked(cleanup.fail).mockRejectedValue(new Error("database unavailable"));
    const remove = vi.fn(async (path: string) => {
      if (path === "bad.png") throw new Error("temporary failure");
    });

    await expect(processFindingImageCleanup(cleanup, { remove })).resolves.toEqual({
      attempted: 2,
      cleaned: 1,
      failed: 1,
    });
    expect(cleanup.complete).toHaveBeenCalledWith("2");
  });
});
