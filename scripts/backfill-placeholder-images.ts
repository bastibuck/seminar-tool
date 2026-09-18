import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const BUCKET = "finding-images";
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#eaeef2"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="28" fill="#57606a">Finding</text></svg>';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!databaseUrl || !supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (run with `node --env-file=.env.local scripts/backfill-placeholder-images.ts`).",
    );
  }

  const sql = postgres(databaseUrl);
  const storage = createClient(supabaseUrl, serviceRoleKey).storage.from(BUCKET);

  const findings = await sql<{ path: string }[]>`
    select image_path as path from findings where image_path like '%/placeholder.svg'
  `;

  let uploaded = 0;
  let alreadyPresent = 0;
  let failed = 0;
  for (const { path } of findings) {
    try {
      const { error } = await storage.upload(path, PLACEHOLDER_SVG, {
        contentType: "image/svg+xml",
        upsert: false,
      });
      if (error && error.message.toLowerCase().includes("already exists")) {
        alreadyPresent++;
      } else if (error) {
        console.error(`upload failed for ${path}: ${error.message}`);
        failed++;
      } else {
        uploaded++;
      }
    } catch (error) {
      console.error(`upload failed for ${path}:`, error);
      failed++;
    }
  }

  await sql.end();
  console.log(
    `backfill complete: ${uploaded} uploaded, ${alreadyPresent} already present, ${failed} failed`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});