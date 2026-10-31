import { createClient } from "@supabase/supabase-js";

import { sql } from "./db";
import { env } from "./env";

export async function canCreateInstructors(userId: string): Promise<boolean> {
  const rows = await sql<{ allowed: boolean }[]>`
    select can_create_instructors as allowed from public.instructors where user_id = ${userId}
  `;
  return rows[0]?.allowed === true;
}

export function validTemporaryPassword(password: string): boolean {
  // Supabase's initial bcrypt password is not prehashed and has a 72-byte limit.
  return [...password].length >= 12 && Buffer.byteLength(password, "utf8") <= 72;
}

export async function createInstructor(input: {
  creatorId: string;
  sessionKey: string;
  email: string;
  password: string;
}): Promise<boolean> {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Auth creation and application enrollment are separate operations. An Auth
  // user alone is not enrolled, and therefore cannot access the application.
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email, password: input.password, email_confirm: true,
  });
  if (error || !data.user) return false;
  const newUserId = data.user.id;

  let enrolled: boolean;
  try {
    enrolled = await sql.begin(async (tx) => {
      // Recheck the live permission and session after the Auth request. Locking
      // the creator serializes this enrollment with permission revocation.
      const creators = await tx<{ user_id: string }[]>`
        select i.user_id from public.instructors i
        join auth.users u on u.id = i.user_id
        join public.instructor_sessions s on s.user_id = i.user_id
        join auth.sessions a on a.id = s.auth_session_id and a.user_id = i.user_id
        where i.user_id = ${input.creatorId} and i.can_create_instructors
          and not i.setup_required and not s.setup_session
          and s.token_hash = ${input.sessionKey} and s.expires_at > clock_timestamp()
          and (a.not_after is null or a.not_after > now())
          and s.credential_hash = encode(extensions.digest(u.encrypted_password, 'sha256'), 'hex')
          and u.deleted_at is null and (u.banned_until is null or u.banned_until < now())
        for update of i, u, s, a
      `;
      if (!creators.length) return false;

      const inserted = await tx<{ user_id: string }[]>`
        insert into public.instructors (user_id)
        select id from auth.users
        where id = ${newUserId} and lower(email) = lower(${input.email})
          and email_confirmed_at is not null and deleted_at is null
          and not is_anonymous and not is_sso_user
          and left(encrypted_password, 4) = '$2a$'
        returning user_id
      `;
      if (!inserted.length) return false;
      await tx`insert into public.instructor_creations (instructor_id, created_by) values (${newUserId}, ${input.creatorId})`;
      return true;
    });
  } catch {
    // A failed/uncertain commit is not safe to undo via the Auth API: it may
    // actually have committed. An operator can inspect the resulting account.
    return false;
  }

  if (!enrolled) {
    // Only delete the exact new Auth account after a known non-enrollment.
    // If cleanup fails, the account remains unenrolled and cannot use the app.
    await admin.auth.admin.deleteUser(newUserId).catch(() => undefined);
  }
  return enrolled;
}
