import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

type AppHealth = {
  note: string;
};

export default async function Home() {
  const [health] = await sql<AppHealth[]>`
    select note from app_health
    order by checked_at desc
    limit 1
  `;

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>Seminar Tool</h1>
      <p>
        Datenbankverbindung: <strong>{health.note}</strong>
      </p>
    </main>
  );
}
