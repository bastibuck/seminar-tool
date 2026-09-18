import type { FindingImageStorage } from "../../lib/finding-image";

export type InMemoryFindingImageStorage = {
  storage: FindingImageStorage;
  objects: Map<string, Uint8Array>;
  uploads: string[];
  removals: string[];
  signCalls: string[][];
};

export function createInMemoryFindingImageStorage(
  objects: Record<string, Uint8Array> = {},
): InMemoryFindingImageStorage {
  const stored = new Map<string, Uint8Array>(Object.entries(objects));
  const record: InMemoryFindingImageStorage = {
    objects: stored,
    uploads: [],
    removals: [],
    signCalls: [],
    storage: {
      async save(path, data) {
        stored.set(path, new Uint8Array(data));
        record.uploads.push(path);
      },
      async remove(path) {
        stored.delete(path);
        record.removals.push(path);
      },
      async sign(paths) {
        record.signCalls.push([...paths]);
        const signed = new Map<string, string | null>();
        let counter = 0;
        for (const path of paths) {
          if (stored.has(path)) {
            signed.set(path, `https://signed/${counter++}`);
          }
        }
        return signed;
      },
    },
  };
  return record;
}