import { sql as database } from "./db";
import { removeFindingImage } from "./finding-images";

export type CleanupItem = {
  id: string;
  path: string;
  attempts: number;
};

export type CleanupStore = {
  claimPending(limit: number): Promise<CleanupItem[]>;
  isReferenced(path: string): Promise<boolean>;
  complete(id: string): Promise<void>;
  fail(id: string, message: string, retryAt: Date): Promise<void>;
};

export type CleanupStorage = {
  remove(path: string): Promise<void>;
};

type SqlExecutor = (strings: TemplateStringsArray, ...values: unknown[]) => unknown;

export type CleanupResult = {
  attempted: number;
  cleaned: number;
  failed: number;
};

export async function enqueueFindingImageCleanup(
  path: string,
  executor: SqlExecutor = database,
): Promise<void> {
  await executor`
    insert into finding_image_cleanup (path)
    values (${path})
    on conflict (path) do nothing
  `;
}

function retryAt(now: Date, attempts: number): Date {
  const delay = Math.min(60 * 60 * 1000, 1000 * 2 ** Math.min(attempts, 10));
  return new Date(now.getTime() + delay);
}

export async function processFindingImageCleanup(
  store: CleanupStore,
  storage: CleanupStorage,
  options: { limit?: number; now?: Date } = {},
): Promise<CleanupResult> {
  const items = await store.claimPending(options.limit ?? 50);
  let cleaned = 0;
  let failed = 0;
  const now = options.now ?? new Date();

  for (const item of items) {
    try {
      if (!(await store.isReferenced(item.path))) {
        await storage.remove(item.path);
      }
      await store.complete(item.id);
      cleaned++;
    } catch (error) {
      failed++;
      try {
        await store.fail(
          item.id,
          error instanceof Error ? error.message : String(error),
          retryAt(now, item.attempts),
        );
      } catch {
        // Keep processing independent cleanup items if bookkeeping is unavailable.
      }
    }
  }

  return { attempted: items.length, cleaned, failed };
}

const productionStore: CleanupStore = {
  async claimPending(limit) {
    return database<CleanupItem[]>`
      update finding_image_cleanup
      set locked_until = now() + interval '5 minutes',
          attempts = attempts + 1
      where id in (
        select id from finding_image_cleanup
        where next_attempt_at <= now()
          and (locked_until is null or locked_until < now())
        order by created_at
        for update skip locked
        limit ${limit}
      )
      returning id, path, attempts
    `;
  },
  async isReferenced(path) {
    const rows = await database<{ exists: boolean }[]>`
      select exists(select 1 from findings where image_path = ${path})
    `;
    return rows[0]!.exists;
  },
  async complete(id) {
    await database`delete from finding_image_cleanup where id = ${id}`;
  },
  async fail(id, message, nextAttemptAt) {
    await database`
      update finding_image_cleanup
      set next_attempt_at = ${nextAttemptAt}, locked_until = null, last_error = ${message}
      where id = ${id}
    `;
  },
};

export async function runFindingImageCleanup(
  options: { limit?: number; now?: Date } = {},
): Promise<CleanupResult> {
  return processFindingImageCleanup(productionStore, { remove: removeFindingImage }, options);
}
