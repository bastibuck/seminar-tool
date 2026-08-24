import { spawn } from "node:child_process";

import { BASE_URL, PORT } from "./server-address";

const READY_TIMEOUT_MS = 60_000;
const EXIT_TIMEOUT_MS = 5_000;

export async function setup() {
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
    { stdio: "inherit" },
  );

  const ready = await waitForReady();

  if (!ready) {
    server.kill();
    throw new Error(`Next.js server did not become ready at ${BASE_URL}`);
  }

  return () => {
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
