import { afterEach, describe, expect, it, vi } from "vitest";

const ALL_VARS = [
  "DATABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "MUTATIONS_ENABLED",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const VALID_ENV: Record<(typeof ALL_VARS)[number], string> = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  CRON_SECRET: "test-cron-secret",
  MUTATIONS_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
};

const originalEnv = Object.fromEntries(ALL_VARS.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.unstubAllEnvs();
  vi.resetModules();
});

function setValidEnv() {
  for (const [name, value] of Object.entries(VALID_ENV)) {
    process.env[name] = value;
  }
}

async function importEnv() {
  vi.resetModules();
  return import("../../lib/env");
}

describe("env validation", () => {
  it("exposes every variable when all six are set", async () => {
    setValidEnv();
    const { env } = await importEnv();

    expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe(VALID_ENV.SUPABASE_SERVICE_ROLE_KEY);
    expect(env.CRON_SECRET).toBe(VALID_ENV.CRON_SECRET);
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(VALID_ENV.NEXT_PUBLIC_SUPABASE_URL);
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(VALID_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    expect(env.MUTATIONS_ENABLED).toBe(true);
  });

  for (const name of ALL_VARS) {
    it(`${name} throws when missing`, async () => {
      setValidEnv();
      delete process.env[name];
      await expect(importEnv()).rejects.toThrow();
    });

    it(`${name} throws when empty`, async () => {
      setValidEnv();
      process.env[name] = "";
      await expect(importEnv()).rejects.toThrow();
    });
  }

  describe("MUTATIONS_ENABLED mapping", () => {
    it("maps the exact lowercase true to a boolean true", async () => {
      setValidEnv();
      process.env.MUTATIONS_ENABLED = "true";
      const { env } = await importEnv();
      expect(env.MUTATIONS_ENABLED).toBe(true);
    });

    it("maps the exact lowercase false to a boolean false", async () => {
      setValidEnv();
      process.env.MUTATIONS_ENABLED = "false";
      const { env } = await importEnv();
      expect(env.MUTATIONS_ENABLED).toBe(false);
    });

    it("throws for anything other than the exact lowercase values", async () => {
      for (const value of ["1", "TRUE", " true", "true "]) {
        setValidEnv();
        process.env.MUTATIONS_ENABLED = value;
        await expect(importEnv()).rejects.toThrow();
      }
    });
  });
});
