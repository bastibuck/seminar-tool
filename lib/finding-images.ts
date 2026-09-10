import { createClient } from "@supabase/supabase-js";

import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./supabase-config";
import type { ProcessedFindingImage } from "./finding-image-processing";
export { FINDING_IMAGE_MAX_BYTES, FINDING_IMAGE_TYPES, validateFindingImage } from "./finding-image-validation";

export const FINDING_IMAGE_BUCKET = "finding-images";
export const FINDING_IMAGE_URL_LIFETIME = 10 * 60;

function storage() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey()).storage.from(FINDING_IMAGE_BUCKET);
}

export async function uploadFindingImage(findingId: string, image: ProcessedFindingImage): Promise<string> {
  const extension = image.contentType.split("/")[1] === "jpeg" ? "jpg" : image.contentType.split("/")[1];
  const path = `findings/${findingId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await storage().upload(path, image.buffer, {
    contentType: image.contentType,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function removeFindingImage(path: string): Promise<void> {
  const { error } = await storage().remove([path]);
  if (error && !error.message.toLowerCase().includes("not found")) throw error;
}

export type FindingIdPath = { id: string; path: string };

const FINDING_PATH_RE = /^findings\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z]+|placeholder\.svg)$/;

export function isOwnedFindingPath(findingId: string, path: string): boolean {
  return FINDING_PATH_RE.test(path) && path.startsWith(`findings/${findingId}/`);
}

export async function signFindingImages(items: FindingIdPath[]): Promise<Map<string, string | null>> {
  if (items.length === 0) return new Map();
  const valid = items.filter(({ id, path }) => isOwnedFindingPath(id, path));
  await Promise.all(valid.map(async ({ path }) => {
    if (!path.endsWith("/placeholder.svg")) return;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#eaeef2"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="28" fill="#57606a">Finding</text></svg>`;
    const { error } = await storage().upload(path, svg, { contentType: "image/svg+xml", upsert: false });
    if (error && !error.message.toLowerCase().includes("already exists")) throw error;
  }));
  const paths = valid.map(({ path }) => path);
  const { data, error } = await storage().createSignedUrls(paths, FINDING_IMAGE_URL_LIFETIME);
  if (error) throw error;
  const signed = new Map<string, string | null>(
    data.flatMap((item) =>
      item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [],
    ),
  );
  for (const { path } of items) {
    if (!signed.has(path)) signed.set(path, null);
  }
  return signed;
}
