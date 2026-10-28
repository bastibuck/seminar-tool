import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  Object.assign(process.env, env);

  return {
    resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
    test: {
      projects: [
        {
          test: {
            name: "unit",
            include: ["tests/unit/**/*.test.{ts,tsx}"],
          },
        },
        {
          test: {
            name: "integration",
            include: ["tests/integration/**/*.test.ts"],
            globalSetup: ["./tests/setup/server.ts"],
          },
        },
      ],
    },
  };
});
