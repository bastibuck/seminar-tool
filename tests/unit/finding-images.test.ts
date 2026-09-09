import { beforeEach, describe, expect, it, vi } from "vitest";

import { FINDING_IMAGE_MAX_BYTES, validateFindingImage } from "../../lib/finding-images";

const storageMocks = vi.hoisted(() => ({
  createSignedUrls: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: { from: storageMocks.from },
  }),
}));

import { FINDING_IMAGE_URL_LIFETIME, signFindingImages } from "../../lib/finding-images";

describe("finding image validation", () => {
  it("accepts supported images up to 10 MB", () => {
    expect(validateFindingImage(new File([new Uint8Array(FINDING_IMAGE_MAX_BYTES)], "x.webp", { type: "image/webp" }))).toBeNull();
  });

  it("rejects unsupported formats and oversized files", () => {
    expect(validateFindingImage(new File(["svg"], "x.svg", { type: "image/svg+xml" }))).toContain("JPEG");
    expect(validateFindingImage(new File([new Uint8Array(FINDING_IMAGE_MAX_BYTES + 1)], "x.png", { type: "image/png" }))).toContain("10 MB");
  });
});

describe("signed finding-image URL lifetime", () => {
  beforeEach(() => {
    storageMocks.createSignedUrls.mockReset();
    storageMocks.createSignedUrls.mockResolvedValue({ data: [], error: null });
    storageMocks.from.mockReturnValue({
      createSignedUrls: storageMocks.createSignedUrls,
    });
  });

  it("limits signed URL validity to 10 minutes", () => {
    expect(FINDING_IMAGE_URL_LIFETIME).toBe(10 * 60);
  });

  it("mints signed URLs with the configured 10-minute lifetime", async () => {
    const path = "findings/a-finding/image.png";

    await signFindingImages([path]);

    expect(storageMocks.createSignedUrls).toHaveBeenCalledWith(
      [path],
      FINDING_IMAGE_URL_LIFETIME,
    );
  });
});