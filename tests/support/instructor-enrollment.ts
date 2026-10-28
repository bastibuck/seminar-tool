import postgres from "postgres";

export async function enrollInstructor(userId: string) {
  const db = postgres(process.env.DATABASE_URL!);
  try {
    await db`insert into public.instructors (user_id) values (${userId})`;
  } finally {
    await db.end();
  }
}
