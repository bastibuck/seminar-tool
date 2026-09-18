import type { FindingIdPath } from "./formats";
import { FORMAT_TO_EXTENSION, isOwnedFindingPath } from "./formats";
import type { ProcessedFindingImage } from "./process";
import { productionFindingImageStorage, type FindingImageStorage } from "./storage";

export async function saveFindingImage(
  findingId: string,
  image: ProcessedFindingImage,
  storage: FindingImageStorage = productionFindingImageStorage(),
): Promise<string> {
  const extension = FORMAT_TO_EXTENSION[image.contentType];
  const path = `findings/${findingId}/${crypto.randomUUID()}.${extension}`;
  await storage.save(path, image.buffer, image.contentType);
  return path;
}

export async function removeFindingImage(
  path: string,
  storage: FindingImageStorage = productionFindingImageStorage(),
): Promise<void> {
  await storage.remove(path);
}

export async function signFindingImages(
  items: FindingIdPath[],
  storage: FindingImageStorage = productionFindingImageStorage(),
): Promise<Map<string, string | null>> {
  if (items.length === 0) return new Map();
  const valid = items.filter(({ id, path }) => isOwnedFindingPath(id, path));
  const signed = await storage.sign(valid.map(({ path }) => path));
  for (const { path } of items) {
    if (!signed.has(path)) signed.set(path, null);
  }
  return signed;
}