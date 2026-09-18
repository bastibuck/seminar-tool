import { createClient } from "@supabase/supabase-js";

import { env } from "../env";
import { FINDING_IMAGE_BUCKET, FINDING_IMAGE_URL_LIFETIME } from "./formats";

export type FindingImageStorage = {
  save(path: string, data: Uint8Array, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
  sign(paths: string[]): Promise<Map<string, string | null>>;
};

function createSupabaseFindingImageStorage(): FindingImageStorage {
  const storage = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  ).storage.from(FINDING_IMAGE_BUCKET);

  return {
    async save(path, data, contentType) {
      const { error } = await storage.upload(path, data, {
        contentType,
        upsert: false,
      });
      if (error) throw error;
    },
    async remove(path) {
      const { error } = await storage.remove([path]);
      if (error && !error.message.toLowerCase().includes("not found")) {
        throw error;
      }
    },
    async sign(paths) {
      const { data, error } = await storage.createSignedUrls(
        paths,
        FINDING_IMAGE_URL_LIFETIME,
      );
      if (error) throw error;
      const signed = new Map<string, string | null>();
      for (const item of data) {
        if (item.path && item.signedUrl) signed.set(item.path, item.signedUrl);
      }
      return signed;
    },
  };
}

let storageSingleton: FindingImageStorage | null = null;

export function productionFindingImageStorage(): FindingImageStorage {
  if (!storageSingleton) {
    storageSingleton = createSupabaseFindingImageStorage();
  }
  return storageSingleton;
}