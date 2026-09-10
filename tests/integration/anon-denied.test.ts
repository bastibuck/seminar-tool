import { describe, expect, it } from "vitest";

import {
  getSupabaseAnonKey,
  getSupabaseUrl,
} from "../../lib/supabase-config";
import { connectTestDb } from "../support/cases";

const supabaseUrl = getSupabaseUrl();
const anonKey = getSupabaseAnonKey();

const TABLES = [
  "app_health",
  "case_types",
  "findings",
  "cases",
  "releases",
] as const;

function restUrl(table: string): string {
  return `${supabaseUrl}/rest/v1/${table}`;
}

function anonHeaders(): Record<string, string> {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json",
  };
}

const db = connectTestDb();

describe("anon-key PostgREST access denied on all application tables", () => {
  for (const table of TABLES) {
    it(`${table}: GET is denied`, async () => {
      const response = await fetch(restUrl(table), {
        headers: anonHeaders(),
      });
      expect(response.ok).toBe(false);
    });

    it(`${table}: POST is denied`, async () => {
      const response = await fetch(restUrl(table), {
        method: "POST",
        headers: anonHeaders(),
        body: JSON.stringify({}),
      });
      expect(response.ok).toBe(false);
    });

    it(`${table}: PATCH is denied`, async () => {
      const response = await fetch(
        `${restUrl(table)}?id=eq.00000000-0000-0000-0000-000000000000`,
        {
          method: "PATCH",
          headers: anonHeaders(),
          body: JSON.stringify({}),
        },
      );
      expect(response.ok).toBe(false);
    });

    it(`${table}: DELETE is denied`, async () => {
      const response = await fetch(
        `${restUrl(table)}?id=eq.00000000-0000-0000-0000-000000000000`,
        {
          method: "DELETE",
          headers: anonHeaders(),
        },
      );
      expect(response.ok).toBe(false);
    });
  }
});

describe("Realtime publication excludes all application tables", () => {
  it("no application table is in the supabase_realtime publication", async () => {
    const rows = await db<{ tablename: string }[]>`
      select tablename
      from pg_publication_tables
      where pubname = 'supabase_realtime'
    `;
    const published = rows.map((r) => r.tablename);
    for (const table of TABLES) {
      expect(published).not.toContain(table);
    }
  });
});
