import { createClient } from "@supabase/supabase-js";

import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./supabase-config";

export const FINDING_IMAGE_BUCKET = "finding-images";
export const FINDING_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const FINDING_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const FINDING_IMAGE_URL_LIFETIME = 24 * 60 * 60;

export function validateFindingImage(file: File | null): string | null {
  if (!file || file.size === 0) return "Bitte wähle ein Bild aus.";
  if (!(FINDING_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Bitte lade ein JPEG-, PNG- oder WebP-Bild hoch.";
  }
  if (file.size > FINDING_IMAGE_MAX_BYTES) return "Das Bild darf höchstens 10 MB groß sein.";
  return null;
}

function storage() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey()).storage.from(FINDING_IMAGE_BUCKET);
}

export async function uploadFindingImage(findingId: string, file: File): Promise<string> {
  const extension = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `findings/${findingId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await storage().upload(path, await file.arrayBuffer(), {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function removeFindingImage(path: string): Promise<void> {
  const { error } = await storage().remove([path]);
  if (error && !error.message.toLowerCase().includes("not found")) throw error;
}

export async function signFindingImages(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  await Promise.all(paths.map(async (path) => {
    if (!path.endsWith("/placeholder.svg")) return;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#eaeef2"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="28" fill="#57606a">Finding</text></svg>`;
    const { error } = await storage().upload(path, svg, { contentType: "image/svg+xml", upsert: false });
    if (error && !error.message.toLowerCase().includes("already exists")) throw error;
  }));
  const { data, error } = await storage().createSignedUrls(paths, FINDING_IMAGE_URL_LIFETIME);
  if (error) throw error;
  return new Map(
    data.flatMap((item) =>
      item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [],
    ),
  );
}
