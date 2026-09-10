import sharp from "sharp";

import { FINDING_IMAGE_TYPES } from "./finding-image-validation";

type FindingImageFormat = (typeof FINDING_IMAGE_TYPES)[number];

export const FINDING_IMAGE_MAX_DIMENSION = 4096;
export const FINDING_IMAGE_MAX_PIXELS = 16_000_000;
export const FINDING_IMAGE_REQUEST_MAX_BYTES = 12 * 1024 * 1024;

const FORMAT_TO_CONTENT_TYPE: Record<string, FindingImageFormat> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export type ProcessedFindingImage = {
  ok: true;
  buffer: Buffer;
  contentType: FindingImageFormat;
};

const NOT_VALID_IMAGE_ERROR = "Die Datei ist kein gültiges Bild.";

export async function validateAndProcessFindingImage(
  file: File,
): Promise<ProcessedFindingImage | { ok: false; error: string }> {
  const bytes = Buffer.from(await file.arrayBuffer());

  let metadata: { width?: number; height?: number; format?: string };
  try {
    metadata = await sharp(bytes).metadata();
  } catch {
    return { ok: false, error: NOT_VALID_IMAGE_ERROR };
  }

  const { width, height, format } = metadata;
  if (!width || !height || !format) {
    return { ok: false, error: NOT_VALID_IMAGE_ERROR };
  }

  const contentType = FORMAT_TO_CONTENT_TYPE[format];
  if (!contentType) {
    return {
      ok: false,
      error: `Unerkanntes Bildformat „${format}". Erlaubt sind JPEG, PNG und WebP.`,
    };
  }

  if (contentType !== file.type) {
    return {
      ok: false,
      error:
        "Der Dateityp muss mit dem tatsächlichen Bildinhalt übereinstimmen. Bitte lade die Datei im passenden Format hoch.",
    };
  }

  if (width > FINDING_IMAGE_MAX_DIMENSION || height > FINDING_IMAGE_MAX_DIMENSION) {
    return {
      ok: false,
      error: `Das Bild ist zu groß. Die maximalen Dimensionen betragen ${FINDING_IMAGE_MAX_DIMENSION}×${FINDING_IMAGE_MAX_DIMENSION} Pixel.`,
    };
  }

  if (width * height > FINDING_IMAGE_MAX_PIXELS) {
    return {
      ok: false,
      error: `Das Bild enthält zu viele Pixel. Maximal sind ${FINDING_IMAGE_MAX_PIXELS.toLocaleString("de-DE")} Pixel erlaubt.`,
    };
  }

  let processed: Buffer;
  try {
    const pipeline = sharp(bytes).rotate();
    if (contentType === "image/jpeg") {
      processed = await pipeline.jpeg({ quality: 90 }).toBuffer();
    } else if (contentType === "image/png") {
      processed = await pipeline.png().toBuffer();
    } else {
      processed = await pipeline.webp({ quality: 90 }).toBuffer();
    }
  } catch {
    return { ok: false, error: NOT_VALID_IMAGE_ERROR };
  }

  return { ok: true, buffer: processed, contentType };
}