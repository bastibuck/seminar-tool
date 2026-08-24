import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./tests/setup/server.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
