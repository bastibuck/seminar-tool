import { describe, expect, it } from "vitest";

import { FINDING_IMAGE_MAX_BYTES, validateFindingImage } from "../../lib/finding-images";

describe("finding image validation", () => {
  it("accepts supported images up to 10 MB", () => {
    expect(validateFindingImage(new File([new Uint8Array(FINDING_IMAGE_MAX_BYTES)], "x.webp", { type: "image/webp" }))).toBeNull();
  });

  it("rejects unsupported formats and oversized files", () => {
    expect(validateFindingImage(new File(["svg"], "x.svg", { type: "image/svg+xml" }))).toContain("JPEG");
    expect(validateFindingImage(new File([new Uint8Array(FINDING_IMAGE_MAX_BYTES + 1)], "x.png", { type: "image/png" }))).toContain("10 MB");
  });
});
