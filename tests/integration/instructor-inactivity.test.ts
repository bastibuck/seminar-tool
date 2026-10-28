import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { env } from "../../lib/env";
import { BASE_URL } from "../setup/server-address";
import { connectTestDb } from "../support/cases";
import { enrollInstructor } from "../support/instructor-enrollment";

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function post(path: string, values: Record<string, string>, cookie?: string) {
  return fetch(`${BASE_URL}${path}`, {
    method: "POST", redirect: "manual",
    headers: { "x-forwarded-for": `test-${crypto.randomUUID()}`, ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams(values),
  });
}

function cookieFrom(response: Response) {
  return response.headers.getSetCookie().find((value) => value.startsWith("instructor_session=") && !value.includes("Max-Age=0"))!.split(";")[0]!;
}

function tokenHash(cookie: string) {
  return createHash("sha256").update(cookie.split("=")[1]!).digest("hex");
}

// Node fetch replaces Sec-Fetch-Mode, so send browser navigation headers over HTTP.
function navigate(path: string, headers: Record<string, string>) {
  return new Promise<number>((resolve, reject) => {
    const request = httpRequest(`${BASE_URL}${path}`, { headers }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode!));
    });
    request.on("error", reject);
    request.end();
  });
}

function nativePost(path: string, headers: Record<string, string>) {
  return new Promise<{ status: number; location?: string }>((resolve, reject) => {
    const request = httpRequest(`${BASE_URL}${path}`, { method: "POST", headers }, (response) => {
      response.resume();
      response.on("end", () => resolve({ status: response.statusCode!, location: response.headers.location }));
    });
    request.on("error", reject);
    request.end();
  });
}

describe("Instructor inactivity", () => {
  it("keeps independent deadlines, renews only qualifying work, and revokes on handover", async () => {
    const email = `inactivity-${crypto.randomUUID()}@example.test`;
    const temporaryPassword = "Temporary password 123";
    const password = "A different password 123";
    const created = await admin.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true });
    expect(created.error).toBeNull();
    const db = connectTestDb();
    try {
      await enrollInstructor(created.data.user!.id);
      const temporary = cookieFrom(await post("/api/instructor/sign-in", { email, password: temporaryPassword }));
      const one = cookieFrom(await post("/api/instructor/password-setup", { password, confirmation: password }, temporary));
      const two = cookieFrom(await post("/api/instructor/sign-in", { email, password }));
      const three = cookieFrom(await post("/api/instructor/sign-in", { email, password }));
      const four = cookieFrom(await post("/api/instructor/sign-in", { email, password }));
      const hashOne = tokenHash(one);
      // The protected page tells the browser how long it may stay open.
      const initialPage = await fetch(`${BASE_URL}/admin`, { headers: { cookie: one } });
      const initialHtml = await initialPage.text();
      const remaining = initialHtml.match(/\\?"remainingMs\\?":(\d+)/);
      expect(remaining).not.toBeNull();
      expect(Number(remaining![1])).toBeGreaterThan(7_190_000);
      expect(Number(remaining![1])).toBeLessThanOrEqual(7_200_000);
      // Move the existing deadlines close to the boundary without waiting two hours.
      await db`update public.instructor_sessions set expires_at = clock_timestamp() + interval '4 seconds' where token_hash in ${db([one, two, three, four].map(tokenHash))}`;

      // Just before the boundary a background read remains authorized but does not renew.
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie: one } })).status).toBe(200);
      expect(await navigate("/admin", { cookie: one, "sec-fetch-mode": "navigate", "purpose": "prefetch" })).toBe(200);
      expect(await navigate("/admin", { cookie: one, "sec-fetch-mode": "navigate" })).toBe(200);
      expect((await post("/api/admin/case-types", {}, one)).status).not.toBe(401);
      expect((await fetch(`${BASE_URL}/viewer`, { headers: { cookie: one } })).status).toBe(200);

      // Separate browsers each receive one kind of qualifying work.
      expect(await navigate("/admin", { cookie: two, "sec-fetch-mode": "navigate", "sec-fetch-user": "?1" })).toBe(200);
      expect(await navigate("/admin", { cookie: `${three}; instructor_navigation=1`, "sec-fetch-mode": "navigate" })).toBe(200);
      const mutation = await fetch(`${BASE_URL}/api/admin/case-types`, {
        method: "POST", headers: { cookie: four, "x-instructor-activity": "1" }, body: new URLSearchParams(),
      });
      expect(mutation.status).not.toBe(401);
      expect(mutation.headers.get("x-instructor-renewed")).toBe("1");
      const afterAction = await (await fetch(`${BASE_URL}/admin`, { headers: { cookie: four } })).text();
      const renewedRemaining = afterAction.match(/\\?"remainingMs\\?":(\d+)/);
      expect(renewedRemaining).not.toBeNull();
      expect(Number(renewedRemaining![1])).toBeGreaterThan(7_190_000);
      expect(Number(renewedRemaining![1])).toBeLessThanOrEqual(7_200_000);

      // Refreshing Supabase credentials cannot move the application deadline.
      const [refresh] = await db<{ token: string }[]>`
        select r.token from auth.refresh_tokens r join public.instructor_sessions s on s.auth_session_id = r.session_id
        where s.token_hash = ${hashOne} and not r.revoked order by r.created_at desc limit 1
      `;
      const direct = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const refreshed = await direct.auth.refreshSession({ refresh_token: refresh!.token });
      expect(refreshed.error).toBeNull();

      await new Promise((resolve) => setTimeout(resolve, 4_100));
      expect((await direct.auth.refreshSession({ refresh_token: refreshed.data.session!.refresh_token })).error).toBeNull();
      const denied = await fetch(`${BASE_URL}/api/admin/case-types`, {
        method: "POST", headers: { cookie: one, "x-instructor-activity": "1" }, body: new URLSearchParams({ name: "Must not be created" }),
      });
      expect(denied.status).toBe(401);
      expect(denied.headers.get("x-instructor-renewed")).toBeNull();
      const native = await nativePost("/api/cases", { cookie: one, "sec-fetch-mode": "navigate", referer: `${BASE_URL}/?from=handover` });
      expect(native.status).toBe(303);
      expect(native.location).toBe("/sign-in?next=%2F%3Ffrom%3Dhandover");
      expect((await fetch(`${BASE_URL}/admin?view=all`, { headers: { cookie: one }, redirect: "manual" })).headers.get("location")).toContain("next=%2Fadmin%3Fview%3Dall");
      for (const cookie of [two, three, four]) {
        const response = await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie } });
        expect(response.status).toBe(200);
        expect(JSON.stringify(await response.json())).not.toContain("Must not be created");
      }
      const staleAction = await fetch(`${BASE_URL}/api/admin/case-types`, {
        method: "POST", headers: { cookie: three, "x-instructor-activity": "1", "x-instructor-session": tokenHash(two) },
        body: new URLSearchParams({ name: "Stale session must not create this" }),
      });
      expect(staleAction.status).toBe(401);
      const staleSignOut = await post("/api/instructor/sign-out", { session: tokenHash(two) }, three);
      expect(staleSignOut.headers.get("location")).toBe("/");
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie: three } })).status).toBe(200);

      const page = await fetch(`${BASE_URL}/admin`, { headers: { cookie: two } });
      const html = await page.text();
      expect(html).toContain(email);
      expect(html).toContain("/api/instructor/sign-out");
      const out = await post("/api/instructor/sign-out", { session: tokenHash(two) }, two);
      expect(out.status).toBe(303);
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie: two } })).status).toBe(401);
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie: three } })).status).toBe(200);
    } finally {
      await admin.auth.admin.deleteUser(created.data.user!.id);
      await db.end();
    }
  }, 15_000);
});
