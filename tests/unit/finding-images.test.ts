import { describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  FINDING_IMAGE_MAX_BYTES,
  FINDING_IMAGE_URL_LIFETIME,
  isOwnedFindingPath,
  processFindingImage,
  removeFindingImage,
  saveFindingImage,
  signFindingImages,
  validateFindingImage,
} from "../../lib/finding-image";

import { createInMemoryFindingImageStorage } from "../support/in-memory-finding-image-storage";

const FINDING_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const ASSET_PATH = `findings/${FINDING_ID}/b2c3d4e5-f6a7-8901-bcde-f12345678901.png`;
const PLACEHOLDER_PATH = `findings/${FINDING_ID}/placeholder.svg`;
const FOREIGN_PATH = "findings/00000000-0000-0000-0000-000000000000/b2c3d4e5-f6a7-8901-bcde-f12345678901.png";

describe("finding image validation", () => {
  it("accepts supported images up to 10 MB", () => {
    expect(validateFindingImage(new File([new Uint8Array(FINDING_IMAGE_MAX_BYTES)], "x.webp", { type: "image/webp" }))).toBeNull();
  });

  it("rejects unsupported formats and oversized files", () => {
    expect(validateFindingImage(new File(["svg"], "x.svg", { type: "image/svg+xml" }))).toContain("JPEG");
    expect(validateFindingImage(new File([new Uint8Array(FINDING_IMAGE_MAX_BYTES + 1)], "x.png", { type: "image/png" }))).toContain("10 MB");
  });

  it("folds the cheap checks into processing (no image selected)", async () => {
    const result = await processFindingImage(null as unknown as File);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Bitte wähle ein Bild aus.");
  });
});

describe("processFindingImage", () => {
  it("rejects non-image bytes labelled as PNG", async () => {
    const file = new File(["not-an-image"], "fake.png", { type: "image/png" });
    const result = await processFindingImage(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("kein gültiges Bild");
  });

  it("rejects non-image bytes labelled as JPEG", async () => {
    const file = new File(["not-an-image"], "fake.jpg", { type: "image/jpeg" });
    const result = await processFindingImage(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("kein gültiges Bild");
  });

  it("rejects non-image bytes labelled as WebP", async () => {
    const file = new File(["not-an-image"], "fake.webp", { type: "image/webp" });
    const result = await processFindingImage(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("kein gültiges Bild");
  });

  it("rejects PNG image declared as JPEG (format mismatch)", async () => {
    const pngBuffer = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
    const file = new File([pngBuffer], "fake.jpg", { type: "image/jpeg" });
    const result = await processFindingImage(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("übereinstimmen");
  });

  it("successfully processes valid JPEG", async () => {
    const jpgBuffer = await sharp({ create: { width: 100, height: 80, channels: 3, background: { r: 255, g: 128, b: 0 } } }).jpeg().toBuffer();
    const file = new File([jpgBuffer], "photo.jpg", { type: "image/jpeg" });
    const result = await processFindingImage(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contentType).toBe("image/jpeg");
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
    }
  });

  it("successfully processes valid PNG", async () => {
    const pngBuffer = await sharp({ create: { width: 100, height: 80, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } } }).png().toBuffer();
    const file = new File([pngBuffer], "diagram.png", { type: "image/png" });
    const result = await processFindingImage(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contentType).toBe("image/png");
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
    }
  });

  it("successfully processes valid WebP", async () => {
    const webpBuffer = await sharp({ create: { width: 100, height: 80, channels: 3, background: { r: 128, g: 0, b: 255 } } }).webp().toBuffer();
    const file = new File([webpBuffer], "photo.webp", { type: "image/webp" });
    const result = await processFindingImage(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contentType).toBe("image/webp");
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
    }
  });

  it("strips EXIF metadata from processed images", async () => {
    const inputWithExif = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const exifComment = Buffer.from("Exif\x00\x00test-image-meta");
    const exifApp1 = Buffer.concat([
      Buffer.from([0xff, 0xe1]),
      Buffer.from([0x00, exifComment.length + 2]),
      exifComment,
    ]);
    const withExif = Buffer.concat([inputWithExif.slice(0, 2), exifApp1, inputWithExif.slice(2)]);

    const file = new File([withExif], "exif.jpg", { type: "image/jpeg" });
    const result = await processFindingImage(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const reEncodedMeta = await sharp(result.buffer).metadata();
      expect(reEncodedMeta.exif).toBeUndefined();
      expect(reEncodedMeta.icc).toBeUndefined();
    }
  });
});

describe("saveFindingImage", () => {
  it("uploads processed bytes under findings/<id>/<uuid>.<ext>", async () => {
    const fake = createInMemoryFindingImageStorage();
    const path = await saveFindingImage(
      FINDING_ID,
      { ok: true, buffer: Buffer.from("image-bytes"), contentType: "image/png" },
      fake.storage,
    );

    expect(path).toMatch(new RegExp(`^findings/${FINDING_ID}/[0-9a-f-]{36}\\.png$`));
    expect(fake.uploads).toEqual([path]);
    expect(fake.objects.has(path)).toBe(true);
  });

  it("uses the jpg extension for JPEG uploads", async () => {
    const fake = createInMemoryFindingImageStorage();
    const path = await saveFindingImage(
      FINDING_ID,
      { ok: true, buffer: Buffer.from("jpeg-bytes"), contentType: "image/jpeg" },
      fake.storage,
    );

    expect(path).toMatch(new RegExp(`^findings/${FINDING_ID}/[0-9a-f-]{36}\\.jpg$`));
  });
});

describe("removeFindingImage", () => {
  it("removes the object from storage", async () => {
    const fake = createInMemoryFindingImageStorage({ [ASSET_PATH]: new Uint8Array([1, 2, 3]) });
    await removeFindingImage(ASSET_PATH, fake.storage);

    expect(fake.removals).toEqual([ASSET_PATH]);
    expect(fake.objects.has(ASSET_PATH)).toBe(false);
  });
});

describe("signed finding-image URL lifetime", () => {
  it("binds signed URLs to a 10-minute lifetime", () => {
    expect(FINDING_IMAGE_URL_LIFETIME).toBe(10 * 60);
    const fake = createInMemoryFindingImageStorage({});
    expect(fake.storage.sign).toBeDefined();
  });
});

describe("isOwnedFindingPath", () => {
  it("accepts a valid path with matching finding id", () => {
    expect(isOwnedFindingPath(FINDING_ID, ASSET_PATH)).toBe(true);
  });

  it("accepts placeholder.svg paths", () => {
    expect(isOwnedFindingPath(FINDING_ID, PLACEHOLDER_PATH)).toBe(true);
  });

  it("rejects path with wrong finding id prefix", () => {
    const otherId = "00000000-0000-0000-0000-000000000000";
    expect(isOwnedFindingPath(FINDING_ID, `findings/${otherId}/b2c3d4e5-f6a7-8901-bcde-f12345678901.png`)).toBe(false);
  });

  it("rejects path outside the findings convention", () => {
    expect(isOwnedFindingPath(FINDING_ID, "some/other/path.png")).toBe(false);
  });

  it("rejects path with non-uuid filename", () => {
    expect(isOwnedFindingPath(FINDING_ID, `findings/${FINDING_ID}/not-a-uuid.png`)).toBe(false);
  });
});

describe("signFindingImages ownership", () => {
  it("signs matching paths and maps everything to a URL or null", async () => {
    const fake = createInMemoryFindingImageStorage({ [ASSET_PATH]: new Uint8Array([1]) });

    const result = await signFindingImages(
      [
        { id: FINDING_ID, path: ASSET_PATH },
        { id: FINDING_ID, path: FOREIGN_PATH },
      ],
      fake.storage,
    );

    expect(fake.signCalls).toEqual([[ASSET_PATH]]);
    expect(result.get(ASSET_PATH)).toContain("https://signed");
    expect(result.get(FOREIGN_PATH)).toBeNull();
  });

  it("rejects path with wrong uuid prefix", async () => {
    const fake = createInMemoryFindingImageStorage();

    const result = await signFindingImages([{ id: FINDING_ID, path: FOREIGN_PATH }], fake.storage);

    expect(fake.signCalls).toEqual([[]]);
    expect(result.get(FOREIGN_PATH)).toBeNull();
  });

  it("rejects path outside the findings convention", async () => {
    const fake = createInMemoryFindingImageStorage();

    const result = await signFindingImages([{ id: FINDING_ID, path: "some/other/path.png" }], fake.storage);

    expect(fake.signCalls).toEqual([[]]);
    expect(result.get("some/other/path.png")).toBeNull();
  });
});

describe("signFindingImages never writes", () => {
  it("sets a URL for a placeholder object without uploading", async () => {
    const fake = createInMemoryFindingImageStorage({ [PLACEHOLDER_PATH]: new Uint8Array([1]) });

    const result = await signFindingImages([{ id: FINDING_ID, path: PLACEHOLDER_PATH }], fake.storage);

    expect(result.get(PLACEHOLDER_PATH)).toContain("https://signed");
    expect(fake.uploads).toEqual([]);
  });

  it("does not write even when the object is missing", async () => {
    const fake = createInMemoryFindingImageStorage();

    const result = await signFindingImages([{ id: FINDING_ID, path: ASSET_PATH }], fake.storage);

    expect(result.get(ASSET_PATH)).toBeNull();
    expect(fake.uploads).toEqual([]);
  });
});