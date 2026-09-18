export const FINDING_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type FindingImageFormat = (typeof FINDING_IMAGE_TYPES)[number];

export const FINDING_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const FINDING_IMAGE_MAX_DIMENSION = 4096;
export const FINDING_IMAGE_MAX_PIXELS = 16_000_000;
export const FINDING_IMAGE_REQUEST_MAX_BYTES = 12 * 1024 * 1024;
export const FINDING_IMAGE_URL_LIFETIME = 10 * 60;
export const FINDING_IMAGE_BUCKET = "finding-images";

export const FORMAT_TO_EXTENSION: Record<FindingImageFormat, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const FORMAT_TO_CONTENT_TYPE: Record<string, FindingImageFormat> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export type FindingIdPath = { id: string; path: string };

export function isOwnedFindingPath(findingId: string, path: string): boolean {
  const FINDING_PATH_RE = /^findings\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z]+|placeholder\.svg)$/;
  return FINDING_PATH_RE.test(path) && path.startsWith(`findings/${findingId}/`);
}