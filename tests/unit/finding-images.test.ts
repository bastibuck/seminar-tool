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

import { FINDING_IMAGE_URL_LIFETIME, isOwnedFindingPath, signFindingImages } from "../../lib/finding-images";

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
    const findingId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const path = `findings/${findingId}/a1b2c3d4-e5f6-7890-abcd-ef1234567890.png`;

    await signFindingImages([{ id: findingId, path }]);

    expect(storageMocks.createSignedUrls).toHaveBeenCalledWith(
      [path],
      FINDING_IMAGE_URL_LIFETIME,
    );
  });
});

describe("isOwnedFindingPath", () => {
  const findingId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  it("accepts a valid path with matching finding id", () => {
    expect(isOwnedFindingPath(findingId, `findings/${findingId}/b2c3d4e5-f6a7-8901-bcde-f12345678901.png`)).toBe(true);
  });

  it("accepts placeholder.svg paths", () => {
    expect(isOwnedFindingPath(findingId, `findings/${findingId}/placeholder.svg`)).toBe(true);
  });

  it("rejects path with wrong finding id prefix", () => {
    const otherId = "00000000-0000-0000-0000-000000000000";
    expect(isOwnedFindingPath(findingId, `findings/${otherId}/b2c3d4e5-f6a7-8901-bcde-f12345678901.png`)).toBe(false);
  });

  it("rejects path outside the findings convention", () => {
    expect(isOwnedFindingPath(findingId, "some/other/path.png")).toBe(false);
  });

  it("rejects path with non-uuid filename", () => {
    expect(isOwnedFindingPath(findingId, `findings/${findingId}/not-a-uuid.png`)).toBe(false);
  });
});

describe("signFindingImages ownership", () => {
  beforeEach(() => {
    storageMocks.createSignedUrls.mockReset();
    storageMocks.from.mockReturnValue({
      createSignedUrls: storageMocks.createSignedUrls,
    });
  });

  it("skips paths that do not match the finding id", async () => {
    const findingId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const validPath = `findings/${findingId}/b2c3d4e5-f6a7-8901-bcde-f12345678901.png`;
    const foreignPath = "findings/00000000-0000-0000-0000-000000000000/b2c3d4e5-f6a7-8901-bcde-f12345678901.png";
    storageMocks.createSignedUrls.mockResolvedValue({ data: [{ path: validPath, signedUrl: "https://signed" }], error: null });

    const result = await signFindingImages([
      { id: findingId, path: validPath },
      { id: findingId, path: foreignPath },
    ]);

    expect(storageMocks.createSignedUrls).toHaveBeenCalledWith([validPath], FINDING_IMAGE_URL_LIFETIME);
    expect(result.get(validPath)).toBe("https://signed");
    expect(result.get(foreignPath)).toBeNull();
  });

  it("rejects path with wrong uuid prefix", async () => {
    const findingId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const badPrefix = "findings/00000000-0000-0000-0000-000000000000/b2c3d4e5-f6a7-8901-bcde-f12345678901.png";
    storageMocks.createSignedUrls.mockResolvedValue({ data: [], error: null });

    const result = await signFindingImages([{ id: findingId, path: badPrefix }]);

    expect(storageMocks.createSignedUrls).toHaveBeenCalledWith([], FINDING_IMAGE_URL_LIFETIME);
    expect(result.get(badPrefix)).toBeNull();
  });

  it("rejects path outside the findings convention", async () => {
    const findingId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    storageMocks.createSignedUrls.mockResolvedValue({ data: [], error: null });

    await signFindingImages([{ id: findingId, path: "some/other/path.png" }]);

    expect(storageMocks.createSignedUrls).toHaveBeenCalledWith([], FINDING_IMAGE_URL_LIFETIME);
  });
});