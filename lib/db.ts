import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export const sql = postgres(connectionString);
