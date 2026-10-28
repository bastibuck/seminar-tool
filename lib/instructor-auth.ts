import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { sql } from "./db";
import { env } from "./env";

const COOKIE = "instructor_session";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const renewedRequests = new WeakSet<Request>();

function client(key: string, userAgent?: string) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(userAgent ? { global: { headers: { "User-Agent": userAgent } } } : {}),
  });
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sessionId(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString());
    return typeof payload.session_id === "string" && UUID.test(payload.session_id)
      ? payload.session_id : null;
  } catch {
    return null;
  }
}

export function safeDestination(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return "/";
  return value;
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const parsed = new URL(origin);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1);
    return parsed.host === host && parsed.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
  });
  (await cookies()).set("instructor_identity", hash(token), {
    httpOnly: false, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
  (await cookies()).delete("instructor_identity");
}

export async function currentInstructor(activity = false, expectedSession?: string | null) {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  if (expectedSession != null && expectedSession !== hash(token)) return null;
  const rows = await sql<{ user_id: string; email: string; setup_required: boolean; setup_session: boolean; expires_at: Date; session_key: string }[]>`
    update public.instructor_sessions s
    set expires_at = case when ${activity} and not s.setup_session then clock_timestamp() + interval '2 hours' else s.expires_at end
    from public.instructors i
    join auth.users u on u.id = i.user_id
    join auth.sessions a on a.user_id = u.id
    where s.token_hash = ${hash(token)}
      and s.user_id = i.user_id and a.id = s.auth_session_id
      and s.expires_at > clock_timestamp()
      and (a.not_after is null or a.not_after > now())
      and s.credential_hash = encode(extensions.digest(u.encrypted_password, 'sha256'), 'hex')
      and s.setup_session = i.setup_required
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until < now())
    returning i.user_id, u.email, i.setup_required, s.setup_session, s.expires_at, s.token_hash as session_key
  `;
  return rows[0] ?? null;
}

function isNavigationActivity(requestHeaders: Headers): boolean {
  const marker = /(?:^|;\s*)instructor_navigation=1(?:;|$)/.test(requestHeaders.get("cookie") ?? "");
  return (requestHeaders.get("sec-fetch-user") === "?1" || marker)
    && requestHeaders.get("sec-fetch-mode") === "navigate"
    && !requestHeaders.has("next-router-prefetch")
    && requestHeaders.get("purpose") !== "prefetch";
}

export async function requireInstructorPage(destination: string) {
  const requestHeaders = await headers();
  const instructor = await currentInstructor(isNavigationActivity(requestHeaders));
  if (!instructor) {
    const intended = requestHeaders.get("x-instructor-destination") ?? destination;
    redirect(`/sign-in?next=${encodeURIComponent(safeDestination(intended))}`);
  }
  if (instructor.setup_required) redirect("/password-setup");
  return instructor;
}

export async function requireInstructorApi(request: Request): Promise<NextResponse | null> {
  if (request.method !== "GET" && request.method !== "HEAD" && !sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Ungültige Anfrage." }, { status: 403 });
  }
  const activity = request.method !== "GET" && request.method !== "HEAD"
    && (request.headers.get("x-instructor-activity") === "1" || isNavigationActivity(request.headers));
  const expectedSession = request.headers.get("x-instructor-session") ?? new URL(request.url).searchParams.get("instructor_session");
  const instructor = await currentInstructor(activity, expectedSession);
  if (!instructor || instructor.setup_required) {
    if (request.headers.get("sec-fetch-mode") === "navigate") {
      let destination = "/";
      try {
        const referer = new URL(request.headers.get("referer") ?? "");
        const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
        const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1);
        if (referer.host === host && referer.protocol === `${protocol}:`) destination = safeDestination(referer.pathname + referer.search);
      } catch {}
      return new NextResponse(null, { status: 303, headers: { Location: `/sign-in?next=${encodeURIComponent(destination)}` } });
    }
    return NextResponse.json({ ok: false, error: "Bitte melde dich an." }, { status: 401 });
  }
  if (activity) renewedRequests.add(request);
  return null;
}

// Only the authoritative authentication check can signal renewal, including
// when validation later rejects an action. Infrastructure errors cannot.
export function withInstructorDeadline<T extends unknown[]>(handler: (request: Request, ...args: T) => Promise<NextResponse>) {
  return async (request: Request, ...args: T): Promise<NextResponse> => {
    const response = await handler(request, ...args);
    if (renewedRequests.has(request)) response.headers.set("x-instructor-renewed", "1");
    return response;
  };
}

export async function signOut(expectedSession: string) {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token && hash(token) !== expectedSession) return false;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    await sql`delete from auth.sessions where id in (select auth_session_id from public.instructor_sessions where token_hash = ${hash(token)})`;
  }
  await clearSessionCookie();
  return true;
}

export async function signIn(email: string, password: string) {
  const instructors = await sql<{ user_id: string; setup_required: boolean; credential_hash: string }[]>`
    select i.user_id, i.setup_required, encode(extensions.digest(u.encrypted_password, 'sha256'), 'hex') as credential_hash
    from public.instructors i join auth.users u on u.id = i.user_id
    where lower(u.email) = lower(${email}) and u.deleted_at is null
  `;
  const instructor = instructors[0];
  if (!instructor) return null;
  const admission = `instructor-${randomBytes(32).toString("hex")}`;
  const admissionHash = hash(admission);
  await sql`delete from public.instructor_login_admissions where expires_at < now()`;
  await sql`
    insert into public.instructor_login_admissions (nonce_hash, user_id, credential_hash, expires_at)
    values (${admissionHash}, ${instructor.user_id}, ${instructor.credential_hash}, now() + interval '1 minute')
  `;
  try {
    // Supabase's bcrypt input is limited to 72 bytes. Prehash the Instructor's
    // chosen password after setup so spaces, Unicode and long passwords work.
    const credential = instructor.setup_required ? password : hash(password);
    const { data, error } = await client(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, admission).auth.signInWithPassword({ email, password: credential });
    if (error || !data.session || data.user.id !== instructor.user_id) return null;
    const authSessionId = sessionId(data.session.access_token);
    if (!authSessionId) return null;
    return sql.begin(async (tx) => {
      const current = await tx<{ user_id: string }[]>`
        select i.user_id from public.instructors i join auth.users u on u.id = i.user_id
        where i.user_id = ${instructor.user_id} and i.setup_required = ${instructor.setup_required}
          and u.deleted_at is null
          and encode(extensions.digest(u.encrypted_password, 'sha256'), 'hex') = ${instructor.credential_hash}
        for update of i
      `;
      if (!current.length) return null;
      const token = randomBytes(32).toString("hex");
      const inserted = await tx<{ token_hash: string }[]>`
        insert into public.instructor_sessions (token_hash, user_id, auth_session_id, credential_hash, setup_session)
        select ${hash(token)}, u.id, a.id, ${instructor.credential_hash}, ${instructor.setup_required}
        from auth.users u join auth.sessions a on a.user_id = u.id
        where u.id = ${instructor.user_id} and a.id = ${authSessionId}
        returning token_hash
      `;
      return inserted.length ? { token, setupRequired: instructor.setup_required } : null;
    });
  } finally {
    await sql`delete from public.instructor_login_admissions where nonce_hash = ${admissionHash}`;
  }
}

export async function completeSetup(password: string): Promise<{ email: string } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token) || [...password].length < 12) return null;
  return sql.begin(async (tx) => {
    const rows = await tx<{ user_id: string; email: string }[]>`
      select i.user_id, u.email from public.instructors i
      join auth.users u on u.id = i.user_id
      join public.instructor_sessions s on s.user_id = i.user_id
      join auth.sessions a on a.id = s.auth_session_id and a.user_id = i.user_id
      where s.token_hash = ${hash(token)} and s.setup_session and i.setup_required
        and s.expires_at > clock_timestamp()
        and (a.not_after is null or a.not_after > now())
        and s.credential_hash = encode(extensions.digest(u.encrypted_password, 'sha256'), 'hex')
        and u.deleted_at is null
        and (u.banned_until is null or u.banned_until < now())
        and left(u.encrypted_password, 4) = '$2a$'
        and u.encrypted_password <> extensions.crypt(${password}, u.encrypted_password)
      for update of i, u
    `;
    const instructor = rows[0];
    if (!instructor) return null;
    // The password update, state transition and all session revocations must
    // commit together. The Auth trigger rejects out-of-band changes.
    await tx`select set_config('seminar.instructor_password_setup', 'on', true)`;
    await tx`
      update auth.users set encrypted_password = extensions.crypt(${hash(password)}, extensions.gen_salt('bf', 10)),
        updated_at = now(), confirmation_token = '', recovery_token = '',
        email_change_token_new = '', email_change_token_current = '', email_change = '',
        email_change_confirm_status = 0, reauthentication_token = '', phone_change = '', phone_change_token = ''
      where id = ${instructor.user_id}
    `;
    await tx`delete from auth.one_time_tokens where user_id = ${instructor.user_id}`;
    // JWTs can outlive a logout. Delete authoritative Auth sessions rather
    // than relying on a JWT's expiry or the browser cookie alone.
    await tx`delete from auth.sessions where user_id = ${instructor.user_id}`;
    await tx`delete from public.instructor_sessions where user_id = ${instructor.user_id}`;
    await tx`update public.instructors set setup_required = false where user_id = ${instructor.user_id}`;
    return { email: instructor.email };
  });
}
