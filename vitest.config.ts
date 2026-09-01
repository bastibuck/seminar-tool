import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  Object.assign(process.env, env);

  return {
    test: {
      projects: [
        {
          test: {
            name: "unit",
            include: ["tests/unit/**/*.test.ts"],
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
