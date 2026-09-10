import { afterAll, describe, expect, it } from "vitest";

import { connectTestDb } from "../support/cases";

const db = connectTestDb();

afterAll(async () => {
  await db.end();
});

// Unique per run so leftover rows from a previous run never skew the assertions.
const runSuffix = Date.now().toString().slice(-3);
const purgeIp = `198.51.100.${runSuffix}81`;
const purgeEndpoint = "integration:purge";

async function runPurge(): Promise<number> {
  const [result] = await db<{ purge_rate_limits: number }[]>`
    select purge_rate_limits()
  `;
  return result!.purge_rate_limits;
}

describe("rate-limit entry purge", () => {
  it("deletes rate-limit entries older than an hour and keeps fresh ones", async () => {
    await db`
      insert into rate_limits (ip, endpoint, created_at)
      values
        (${purgeIp}, ${purgeEndpoint}, now() - interval '2 hours'),
        (${purgeIp}, ${purgeEndpoint}, now() - interval '30 minutes')
    `;

    expect(await runPurge()).toBe(1);

    const remaining = await db`
      select 1
      from rate_limits
      where ip = ${purgeIp} and endpoint = ${purgeEndpoint}
    `;
    expect(remaining.length).toBe(1);

    expect(await runPurge()).toBe(0);
  });

  it("trims nothing when every entry is recent", async () => {
    await db`
      insert into rate_limits (ip, endpoint)
      values (${purgeIp}, 'integration:purge-fresh')
    `;

    expect(await runPurge()).toBe(0);

    const remaining = await db`
      select 1
      from rate_limits
      where ip = ${purgeIp} and endpoint = 'integration:purge-fresh'
    `;
    expect(remaining.length).toBe(1);
  });
});