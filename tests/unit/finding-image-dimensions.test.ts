import { describe, expect, it, vi } from "vitest";

import {
  FINDING_IMAGE_MAX_DIMENSION,
  FINDING_IMAGE_MAX_PIXELS,
  validateAndProcessFindingImage,
} from "../../lib/finding-image-processing";

const mockMetadata = vi.fn();
const mockToBuffer = vi.fn();

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    metadata: mockMetadata,
    rotate: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: mockToBuffer,
  })),
}));

describe("validateAndProcessFindingImage dimension limits", () => {
  it("rejects image exceeding max width", async () => {
    mockMetadata.mockResolvedValue({ width: FINDING_IMAGE_MAX_DIMENSION + 1, height: 100, format: "png" });
    const file = new File([Buffer.alloc(10)], "wide.png", { type: "image/png" });
    const result = await validateAndProcessFindingImage(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Dimensionen");
  });

  it("rejects image exceeding max height", async () => {
    mockMetadata.mockResolvedValue({ width: 100, height: FINDING_IMAGE_MAX_DIMENSION + 1, format: "png" });
    const file = new File([Buffer.alloc(10)], "tall.png", { type: "image/png" });
    const result = await validateAndProcessFindingImage(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Dimensionen");
  });

  it("rejects image exceeding total pixel count (pixel bomb)", async () => {
    mockMetadata.mockResolvedValue({ width: 5000, height: 5000, format: "png" });
    const file = new File([Buffer.alloc(10)], "pixelbomb.png", { type: "image/png" });
    const result = await validateAndProcessFindingImage(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Pixel");
  });

  it("accepts image within dimension limits", async () => {
    mockMetadata.mockResolvedValue({ width: 1920, height: 1080, format: "jpeg" });
    mockToBuffer.mockResolvedValue(Buffer.from("processed-jpeg"));
    const file = new File([Buffer.alloc(10)], "hd.jpg", { type: "image/jpeg" });
    const result = await validateAndProcessFindingImage(file);
    expect(result.ok).toBe(true);
  });
});
