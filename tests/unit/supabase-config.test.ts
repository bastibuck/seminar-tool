import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSupabaseAnonKey,
  getSupabaseUrl,
} from "../../lib/supabase-config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSupabaseUrl", () => {
  it("defaults to the localhost Supabase URL when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(getSupabaseUrl()).toBe("http://127.0.0.1:54321");
  });

  it("reads the URL from the environment when set", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://abc.example.supabase.co",
    );
    expect(getSupabaseUrl()).toBe("https://abc.example.supabase.co");
  });
});

describe("getSupabaseAnonKey", () => {
  it("returns the anon key from the environment", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    expect(getSupabaseAnonKey()).toBe("test-anon-key");
  });

  it("fails loudly when the anon key is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(() => getSupabaseAnonKey()).toThrow(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  });
});
