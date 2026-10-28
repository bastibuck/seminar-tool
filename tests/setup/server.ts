import { spawn } from "node:child_process";
import type { TestProject } from "vitest/node";

import { BASE_URL, PORT } from "./server-address";
import { provisionInstructor } from "./instructor";

const READY_TIMEOUT_MS = 60_000;
const EXIT_TIMEOUT_MS = 5_000;

export async function setup(project: TestProject) {
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
    // A stale deployment value must no longer disable authenticated writes.
    { stdio: "inherit", env: { ...process.env, MUTATIONS_ENABLED: "false" } },
  );

  const ready = await waitForReady();

  if (!ready) {
    server.kill();
    throw new Error(`Next.js server did not become ready at ${BASE_URL}`);
  }

  let removeInstructor: Awaited<ReturnType<typeof provisionInstructor>>;
  try {
    removeInstructor = await provisionInstructor(project, BASE_URL);
  } catch (error) {
    server.kill();
    throw error;
  }
  return async () => {
    await removeInstructor();
    server.kill();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, EXIT_TIMEOUT_MS);
      server.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  };
}

async function waitForReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}
