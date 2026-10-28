import { createClient } from "@supabase/supabase-js";
import { describe, expect, inject, it } from "vitest";

import { BASE_URL } from "../setup/server-address";
import { connectTestDb, createCase, extractCaseTypeId, extractCode, getStartPage, resolveLocation } from "../support/cases";
import { enrollInstructor } from "../support/instructor-enrollment";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
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
  return response.headers.getSetCookie().find((cookie) => cookie.startsWith("instructor_session=") && !cookie.includes("Max-Age=0"))!.split(";")[0]!;
}

async function checkProtectedCategories(cookie: string, authorized: boolean) {
  const id = "00000000-0000-4000-8000-000000000000";
  const pages = ["/", "/admin", `/admin/case-types/${id}`, `/admin/case-types/${id}/findings/new`, `/cockpit/${id}`];
  for (const path of pages) {
    const response = await fetch(`${BASE_URL}${path}`, { headers: { cookie }, redirect: "manual" });
    if (authorized) expect([200, 404]).toContain(response.status);
    else expect(response.status).toBe(307);
  }
  const routes = [
    ["POST", "/api/cases"], ["GET", `/api/cases/${id}`],
    ["POST", `/api/cases/${id}/end`], ["POST", `/api/cases/${id}/releases`],
    ["GET", "/api/admin/case-types"], ["POST", "/api/admin/case-types"],
    ["PUT", "/api/admin/case-types"], ["DELETE", "/api/admin/case-types"],
    ["GET", `/api/admin/case-types/${id}`], ["POST", `/api/admin/case-types/${id}`],
    ["PUT", `/api/admin/case-types/${id}`], ["PATCH", `/api/admin/case-types/${id}`],
    ["DELETE", `/api/admin/case-types/${id}`], ["GET", `/api/admin/findings/${id}`],
    ["PATCH", `/api/admin/findings/${id}`],
  ] as const;
  for (const [method, path] of routes) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method, redirect: "manual", headers: { cookie },
      ...(method === "GET" ? {} : { body: new URLSearchParams({ id, findingId: id, findingA: id, findingB: id }) }),
    });
    if (authorized) {
      expect(response.status).not.toBe(401);
      expect(response.status).toBeLessThan(500);
    } else expect(response.status).toBe(401);
  }
}

describe("Instructor access", () => {
  const id = "00000000-0000-4000-8000-000000000000";

  it.each([
    "/",
    "/admin",
    `/admin/case-types/${id}`,
    `/admin/case-types/${id}/findings/new`,
    `/cockpit/${id}`,
  ])("requires sign-in before rendering %s", async (path) => {
    const response = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get("location")).toBeTruthy();
  });

  it.each([
    ["POST", "/api/cases"],
    ["GET", `/api/cases/${id}`],
    ["POST", `/api/cases/${id}/end`],
    ["POST", `/api/cases/${id}/releases`],
    ["GET", "/api/admin/case-types"],
    ["POST", "/api/admin/case-types"],
    ["PUT", "/api/admin/case-types"],
    ["DELETE", "/api/admin/case-types"],
    ["GET", `/api/admin/case-types/${id}`],
    ["POST", `/api/admin/case-types/${id}`],
    ["PUT", `/api/admin/case-types/${id}`],
    ["PATCH", `/api/admin/case-types/${id}`],
    ["DELETE", `/api/admin/case-types/${id}`],
    ["GET", `/api/admin/findings/${id}`],
    ["PATCH", `/api/admin/findings/${id}`],
  ])("denies unauthenticated %s %s", async (method, path) => {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      redirect: "manual",
      ...(method === "GET"
        ? {}
        : { body: new URLSearchParams(), headers: { "content-type": "application/x-www-form-urlencoded" } }),
    });

    expect(response.status).toBe(401);
  });

  it("keeps the Viewer join page available without sign-in", async () => {
    const response = await fetch(`${BASE_URL}/viewer`, { redirect: "manual" });

    expect(response.status).toBe(200);
  });

  it("keeps the internal cleanup endpoint separately protected from Instructor access", async () => {
    for (const headers of [new Headers(), new Headers({ cookie: inject("instructorCookie") })]) {
      const response = await fetch(`${BASE_URL}/api/internal/finding-image-cleanup`, { headers });
      expect(response.status).toBe(401);
    }
  });

  it("requires password setup before a new Instructor can use protected endpoints", async () => {
    const email = `instructor-${crypto.randomUUID()}@example.test`;
    const temporaryPassword = "Temporary password 123";
    const { data, error } = await admin.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true });
    expect(error).toBeNull();
    const userId = data.user!.id;
    try {
      await enrollInstructor(userId);
      const login = await fetch(`${BASE_URL}/api/instructor/sign-in`, {
        method: "POST",
        redirect: "manual",
        body: new URLSearchParams({ email, password: temporaryPassword, next: "/admin" }),
      });
      expect(login.status).toBe(303);
      expect(login.headers.get("location")).toBe("/password-setup");
      const temporaryCookie = login.headers.get("set-cookie")!.split(";")[0]!;
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie: temporaryCookie } })).status).toBe(401);
      await checkProtectedCategories(temporaryCookie, false);

      // An interrupted or rejected setup leaves the temporary password usable.
      const short = await post("/api/instructor/password-setup", { password: "short pass", confirmation: "short pass" }, temporaryCookie);
      expect(short.headers.get("location")).toContain("/password-setup?error=");
      const unchanged = await post("/api/instructor/password-setup", { password: temporaryPassword, confirmation: temporaryPassword }, temporaryCookie);
      expect(unchanged.headers.get("location")).toContain("/password-setup?error=");
      const secondLogin = await post("/api/instructor/sign-in", { email, password: temporaryPassword });
      expect(secondLogin.headers.get("location")).toBe("/password-setup");
      const secondTemporaryCookie = cookieFrom(secondLogin);
      const direct = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const directLogin = await direct.auth.signInWithPassword({ email, password: temporaryPassword });
      expect(directLogin.error).toBeNull();
      const oldJwt = directLogin.data.session!.access_token;
      const oldRefresh = directLogin.data.session!.refresh_token;
      const recoveryLink = await admin.auth.admin.generateLink({ type: "recovery", email });
      expect(recoveryLink.error).toBeNull();

      const [setup, directChange] = await Promise.all([
        post("/api/instructor/password-setup", { password: "pass  word12", confirmation: "pass  word12" }, temporaryCookie),
        direct.auth.updateUser({ password: "attacker password 123" }),
      ]);
      expect(directChange.error).not.toBeNull();
      expect(setup.status).toBe(303);
      expect(setup.headers.get("location")).toBe("/");
      const activeCookie = cookieFrom(setup);
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie: activeCookie } })).status).toBe(200);
      await checkProtectedCategories(activeCookie, true);
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie: temporaryCookie } })).status).toBe(401);
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie: secondTemporaryCookie } })).status).toBe(401);
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { authorization: `Bearer ${oldJwt}` } })).status).toBe(401);
      expect((await direct.auth.refreshSession({ refresh_token: oldRefresh })).error).not.toBeNull();
      // Check Auth's actual response rather than assuming logout behavior.
      expect((await direct.auth.getUser(oldJwt)).error).not.toBeNull();
      const recovery = await direct.auth.verifyOtp({ token_hash: recoveryLink.data.properties!.hashed_token, type: "recovery" });
      expect(recovery.error).not.toBeNull();
      expect((await admin.auth.admin.updateUserById(userId, { password: "operator replacement password" })).error).not.toBeNull();
      const staleSetup = await post("/api/instructor/password-setup", { password: "attacker password 123", confirmation: "attacker password 123" }, secondTemporaryCookie);
      expect(staleSetup.headers.get("location")).toContain("/password-setup?error=");

      const normalLogin = await post("/api/instructor/sign-in", { email, password: "pass  word12", next: "/admin?from=cockpit" });
      expect(normalLogin.headers.get("location")).toBe("/admin?from=cockpit");
      const unsafeLogin = await post("/api/instructor/sign-in", { email, password: "pass  word12", next: "//evil.example/path" });
      expect(unsafeLogin.headers.get("location")).toBe("/");
      const backslashLogin = await post("/api/instructor/sign-in", { email, password: "pass  word12", next: "/\\evil.example" });
      expect(backslashLogin.headers.get("location")).toBe("/");
      const crossSite = await fetch(`${BASE_URL}/api/admin/case-types`, {
        method: "POST", headers: { cookie: activeCookie, origin: "https://evil.example" },
        body: new URLSearchParams({ name: "Must not be created" }),
      });
      expect(crossSite.status).toBe(403);

      const removed = await admin.auth.admin.deleteUser(userId);
      expect(removed.error).toBeNull();
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie: activeCookie } })).status).toBe(401);
      expect((await fetch(`${BASE_URL}/`, { headers: { cookie: activeCookie }, redirect: "manual" })).status).toBe(307);
      await checkProtectedCategories(activeCookie, false);
    } finally {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("preserves a local intended destination on protected page redirects", async () => {
    const response = await fetch(`${BASE_URL}/admin?view=all`, { redirect: "manual" });
    const location = new URL(response.headers.get("location")!, BASE_URL);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("next")).toBe("/admin?view=all");
  });

  it("requires explicit enrollment for a newly created Auth account", async () => {
    const email = `unreviewed-${crypto.randomUUID()}@example.test`;
    const password = "Temporary password 123";
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(error).toBeNull();
    const db = connectTestDb();
    try {
      const enrolled = await db`select user_id from public.instructors where user_id = ${data.user!.id}`;
      expect(enrolled).toHaveLength(0);
      const unreviewed = await post("/api/instructor/sign-in", { email, password });
      expect(unreviewed.headers.get("location")).toContain("/sign-in?");
      expect(unreviewed.headers.getSetCookie().some((cookie) => cookie.startsWith("instructor_session="))).toBe(false);
      await checkProtectedCategories("", false);

      // An Auth token alone is not an Instructor application session.
      const direct = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const directLogin = await direct.auth.signInWithPassword({ email, password });
      expect(directLogin.error).toBeNull();
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, {
        headers: { authorization: `Bearer ${directLogin.data.session!.access_token}` },
      })).status).toBe(401);

      await db`insert into public.instructors(user_id) values (${data.user!.id})`;
      const reviewed = await post("/api/instructor/sign-in", { email, password });
      expect(reviewed.headers.get("location")).toBe("/password-setup");
      const setup = await post("/api/instructor/password-setup", {
        password: "A different password 123", confirmation: "A different password 123",
      }, cookieFrom(reviewed));
      const cookie = cookieFrom(setup);
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie } })).status).toBe(200);
      await db`delete from public.instructors where user_id = ${data.user!.id}`;
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie } })).status).toBe(401);
      expect((await post("/api/instructor/sign-in", { email, password: "A different password 123" })).headers.get("location")).toContain("/sign-in?");
    } finally {
      await admin.auth.admin.deleteUser(data.user!.id);
      await db.end();
    }
  });

  it("rejects public registration directly at Supabase Auth", async () => {
    const anon = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.auth.signUp({ email: `public-${crypto.randomUUID()}@example.test`, password: "public password 123" });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it("limits repeated sign-in attempts from one client", async () => {
    const ip = `test-${crypto.randomUUID()}`;
    let response: Response | undefined;
    for (let attempt = 0; attempt < 21; attempt++) {
      response = await fetch(`${BASE_URL}/api/instructor/sign-in`, {
        method: "POST", redirect: "manual", headers: { "x-forwarded-for": ip },
        body: new URLSearchParams({ email: "unknown@example.test", password: "wrong password" }),
      });
    }
    expect(response!.status).toBe(429);
  });

  it("serializes concurrent setup attempts and invalidates the losing session", async () => {
    const email = `race-${crypto.randomUUID()}@example.test`;
    const password = "Temporary password 123";
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    try {
      await enrollInstructor(created.data.user!.id);
      const one = cookieFrom(await post("/api/instructor/sign-in", { email, password }));
      const two = cookieFrom(await post("/api/instructor/sign-in", { email, password }));
      const [first, second] = await Promise.all([
        post("/api/instructor/password-setup", { password: "first password 123", confirmation: "first password 123" }, one),
        post("/api/instructor/password-setup", { password: "second password 123", confirmation: "second password 123" }, two),
      ]);
      const locations = [first.headers.get("location"), second.headers.get("location")];
      expect(locations.filter((location) => location === "/")).toHaveLength(1);
      expect(locations.filter((location) => location?.startsWith("/password-setup?error="))).toHaveLength(1);
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie: one } })).status).toBe(401);
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie: two } })).status).toBe(401);
    } finally {
      await admin.auth.admin.deleteUser(created.data.user!.id);
    }
  });

  it("refuses an Auth session verified with the temporary password before setup commits", async () => {
    const email = `late-${crypto.randomUUID()}@example.test`;
    const password = "Temporary password 123";
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    await enrollInstructor(created.data.user!.id);
    const db = connectTestDb();
    const observer = connectTestDb();
    let unlock!: () => void;
    let ready!: (pid: number) => void;
    const released = new Promise<void>((resolve) => { unlock = resolve; });
    const locked = new Promise<number>((resolve) => { ready = resolve; });
    const transition = db.begin(async (tx) => {
      const [row] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
      await tx`update public.instructors set setup_required = false where user_id = ${created.data.user!.id}`;
      ready(row!.pid);
      await released;
    });
    try {
      const pid = await locked;
      const direct = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const login = direct.auth.signInWithPassword({ email, password });
      let blocked = false;
      for (let attempt = 0; attempt < 150 && !blocked; attempt++) {
        const [row] = await observer<{ count: number }[]>`
          select count(*)::int as count from pg_stat_activity
          where ${pid} = any(pg_blocking_pids(pid)) and query ilike '%sessions%'
        `;
        blocked = row!.count > 0;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      unlock();
      await transition;
      expect(blocked).toBe(true);
      expect((await login).error).not.toBeNull();
    } finally {
      unlock();
      await transition;
      await admin.auth.admin.deleteUser(created.data.user!.id);
      await db.end();
      await observer.end();
    }
  }, 15_000);

  it("does not hold up account deletion while sign-in is waiting on Auth", async () => {
    const email = `delete-race-${crypto.randomUUID()}@example.test`;
    const password = "Temporary password 123";
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    await enrollInstructor(created.data.user!.id);
    const db = connectTestDb();
    const observer = connectTestDb();
    let unlock!: () => void;
    let ready!: (pid: number) => void;
    const released = new Promise<void>((resolve) => { unlock = resolve; });
    const locked = new Promise<number>((resolve) => { ready = resolve; });
    const lock = db.begin(async (tx) => {
      const [row] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
      await tx`select id from auth.users where id = ${created.data.user!.id} for update`;
      ready(row!.pid);
      await released;
    });
    try {
      const pid = await locked;
      const login = post("/api/instructor/sign-in", { email, password });
      let blocked = false;
      for (let attempt = 0; attempt < 150 && !blocked; attempt++) {
        const [row] = await observer<{ count: number }[]>`
          select count(*)::int as count from pg_stat_activity
          where ${pid} = any(pg_blocking_pids(pid)) and query ilike '%sessions%'
        `;
        blocked = row!.count > 0;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const deletion = admin.auth.admin.deleteUser(created.data.user!.id);
      unlock();
      await lock;
      const [loginResult, deleteResult] = await Promise.all([login, deletion]);
      expect(blocked).toBe(true);
      expect(deleteResult.error).toBeNull();
      const cookie = loginResult.headers.get("set-cookie")?.split(";")[0];
      if (cookie) expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie } })).status).toBe(401);
    } finally {
      unlock();
      await lock;
      await admin.auth.admin.deleteUser(created.data.user!.id);
      await db.end();
      await observer.end();
    }
  }, 15_000);

  it("supports long Unicode passwords and immediately denies soft-deleted accounts", async () => {
    const email = `long-${crypto.randomUUID()}@example.test`;
    const temporaryPassword = "Temporary password 123";
    const password = "Wörter mit Leerzeichen ".repeat(8);
    const created = await admin.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true });
    expect(created.error).toBeNull();
    try {
      await enrollInstructor(created.data.user!.id);
      const pending = cookieFrom(await post("/api/instructor/sign-in", { email, password: temporaryPassword }));
      const setup = await post("/api/instructor/password-setup", { password, confirmation: password }, pending);
      expect(setup.headers.get("location")).toBe("/");
      const cookie = cookieFrom(setup);
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie } })).status).toBe(200);
      expect((await post("/api/instructor/sign-in", { email, password })).headers.get("location")).toBe("/");
      expect((await admin.auth.admin.deleteUser(created.data.user!.id, true)).error).toBeNull();
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie } })).status).toBe(401);
    } finally {
      await admin.auth.admin.deleteUser(created.data.user!.id);
    }
  });

  it("lets two Instructors share a Case and preserves it when one is deleted and recreated", async () => {
    const email = `shared-${crypto.randomUUID()}@example.test`;
    const temporaryPassword = "Temporary password 123";
    const password = "A different password 123";
    const created = await admin.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true });
    expect(created.error).toBeNull();
    let userId = created.data.user!.id;
    const db = connectTestDb();
    const name = `Shared case ${crypto.randomUUID()}`;
    try {
      await enrollInstructor(userId);
      const pending = cookieFrom(await post("/api/instructor/sign-in", { email, password: temporaryPassword }));
      const secondCookie = cookieFrom(await post("/api/instructor/password-setup", { password, confirmation: password }, pending));
      const caseTypeId = extractCaseTypeId(await getStartPage());
      const start = await createCase({ caseTypeId, name });
      const cockpitUrl = resolveLocation(start.headers.get("location")!);
      const sharedPage = await fetch(cockpitUrl, { headers: { cookie: secondCookie } });
      expect(sharedPage.status).toBe(200);
      const code = extractCode(await sharedPage.text());
      const [finding] = await db<{ id: string; name: string }[]>`select id, name from findings where case_type_id = ${caseTypeId} order by position limit 1`;
      const release = await post(`${new URL(cockpitUrl).pathname.replace("/cockpit/", "/api/cases/")}/releases`, { findingId: finding!.id, intent: "release" }, secondCookie);
      expect(release.status).toBe(200);
      const viewer = await fetch(`${BASE_URL}/viewer/${code.replace("-", "")}`);
      expect(viewer.status).toBe(200);
      expect(await viewer.text()).toContain(finding!.name);

      expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
      expect((await fetch(cockpitUrl, { headers: { cookie: secondCookie }, redirect: "manual" })).status).toBe(307);
      expect((await fetch(cockpitUrl, { headers: { cookie: inject("instructorCookie") } })).status).toBe(200);
      expect((await fetch(`${BASE_URL}/viewer/${code.replace("-", "")}`)).status).toBe(200);

      const recreated = await admin.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true });
      expect(recreated.error).toBeNull();
      expect(recreated.data.user!.id).not.toBe(userId);
      userId = recreated.data.user!.id;
      await enrollInstructor(userId);
      const newLogin = await post("/api/instructor/sign-in", { email, password: temporaryPassword });
      expect(newLogin.headers.get("location")).toBe("/password-setup");
      const newSetup = await post("/api/instructor/password-setup", { password, confirmation: password }, cookieFrom(newLogin));
      expect((await fetch(cockpitUrl, { headers: { cookie: cookieFrom(newSetup) } })).status).toBe(200);
      expect((await fetch(`${BASE_URL}/viewer/${code.replace("-", "")}`)).status).toBe(200);
    } finally {
      await admin.auth.admin.deleteUser(userId);
      await db`delete from cases where name = ${name}`;
      await db.end();
    }
  });
});
