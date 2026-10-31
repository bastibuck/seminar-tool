import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { BASE_URL } from "../setup/server-address";
import { connectTestDb } from "../support/cases";
import { enrollInstructor } from "../support/instructor-enrollment";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function post(path: string, values: Record<string, string>, cookie?: string, headers: Record<string, string> = {}) {
  return fetch(`${BASE_URL}${path}`, {
    method: "POST", redirect: "manual",
    headers: { "x-forwarded-for": `test-${crypto.randomUUID()}`, ...(cookie ? { cookie } : {}), ...headers },
    body: new URLSearchParams(values),
  });
}

function cookieFrom(response: Response) {
  return response.headers.getSetCookie().find((cookie) => cookie.startsWith("instructor_session=") && !cookie.includes("Max-Age=0"))!.split(";")[0]!;
}

describe("delegated Instructor creation", () => {
  it("restricts creation, enrolls with setup and audits until either Instructor is deleted", async () => {
    const db = connectTestDb();
    const createdIds: string[] = [];
    const creatorEmail = `creator-${crypto.randomUUID()}@example.test`;
    const recipientEmail = `recipient-${crypto.randomUUID()}@example.test`;
    const secondEmail = `recipient-${crypto.randomUUID()}@example.test`;
    const temporaryPassword = "Temporary password 123";
    const createPath = "/api/admin/instructors";
    try {
      const creator = await admin.auth.admin.createUser({ email: creatorEmail, password: temporaryPassword, email_confirm: true });
      expect(creator.error).toBeNull();
      const creatorId = creator.data.user!.id;
      createdIds.push(creatorId);
      await enrollInstructor(creatorId);
      const login = await post("/api/instructor/sign-in", { email: creatorEmail, password: temporaryPassword });
      expect(login.headers.get("location")).toBe("/password-setup");
      const setupCookie = cookieFrom(login);
      expect((await post(createPath, { email: recipientEmail, password: temporaryPassword }, setupCookie)).status).toBe(401);
      const setup = await post("/api/instructor/password-setup", { password: "Creator new password 123", confirmation: "Creator new password 123" }, setupCookie);
      const creatorCookie = cookieFrom(setup);

      expect((await post(createPath, { email: recipientEmail, password: temporaryPassword })).status).toBe(401);
      expect((await post(createPath, { email: recipientEmail, password: temporaryPassword }, creatorCookie)).status).toBe(403);
      expect((await fetch(`${BASE_URL}/admin/instructors/new`, { headers: { cookie: creatorCookie } })).status).toBe(404);
      expect(await (await fetch(`${BASE_URL}/admin`, { headers: { cookie: creatorCookie } })).text()).not.toContain("Kursleitung hinzufügen");

      await db`update public.instructors set can_create_instructors = true where user_id = ${creatorId}`;
      const adminHtml = await (await fetch(`${BASE_URL}/admin`, { headers: { cookie: creatorCookie } })).text();
      expect(adminHtml).toMatch(/<div class="button-row"><button[^>]*>Falltyp anlegen<\/button><a class="button button--link" href="\/admin\/instructors\/new">Kursleitung hinzufügen<\/a><\/div>/);
      const newInstructorPage = await fetch(`${BASE_URL}/admin/instructors/new`, { headers: { cookie: creatorCookie } });
      expect(newInstructorPage.status).toBe(200);
      const newInstructorHtml = await newInstructorPage.text();
      expect(newInstructorHtml).toContain("Mindestens 12 Zeichen; Leerzeichen sind erlaubt.");
      expect(newInstructorHtml).not.toContain("UTF-8");
      expect((await post(createPath, { email: recipientEmail, password: temporaryPassword }, creatorCookie, { origin: "https://evil.example" })).status).toBe(403);
      expect((await post(createPath, { email: "not-an-email", password: temporaryPassword }, creatorCookie)).status).toBe(400);
      const shortPassword = await post(createPath, { email: recipientEmail, password: "short pass" }, creatorCookie);
      expect(shortPassword.status).toBe(400);
      expect((await shortPassword.json()).error).toBe("Das Passwort muss mindestens 12 Zeichen lang sein.");
      const longPassword = await post(createPath, { email: recipientEmail, password: "ä".repeat(37) }, creatorCookie);
      expect(longPassword.status).toBe(400);
      expect((await longPassword.json()).error).toBe("Das Passwort ist zu lang. Bitte verwende ein kürzeres Passwort.");

      const response = await post(createPath, { email: recipientEmail, password: temporaryPassword }, creatorCookie);
      expect(response.status).toBe(201);
      const recipients = await db<{ user_id: string; can_create_instructors: boolean; setup_required: boolean; created_by: string }[]>`
        select i.user_id, i.can_create_instructors, i.setup_required, c.created_by
        from public.instructors i join auth.users u on u.id = i.user_id
        join public.instructor_creations c on c.instructor_id = i.user_id
        where u.email = ${recipientEmail}
      `;
      expect(recipients).toHaveLength(1);
      const recipientId = recipients[0]!.user_id;
      createdIds.push(recipientId);
      expect(recipients[0]).toMatchObject({ can_create_instructors: false, setup_required: true, created_by: creatorId });

      const duplicate = await post(createPath, { email: recipientEmail, password: "Another password 123" }, creatorCookie);
      const duplicateCreator = await post(createPath, { email: creatorEmail, password: "Another password 123" }, creatorCookie);
      expect(duplicate.status).toBe(400);
      expect(await duplicate.json()).toEqual(await duplicateCreator.json());
      const existingEmail = `existing-${crypto.randomUUID()}@example.test`;
      const existing = await admin.auth.admin.createUser({ email: existingEmail, password: "Existing password 123", email_confirm: true });
      expect(existing.error).toBeNull();
      createdIds.push(existing.data.user!.id);
      const duplicateUnenrolled = await post(createPath, { email: existingEmail, password: "Another password 123" }, creatorCookie);
      expect(duplicateUnenrolled.status).toBe(400);
      expect(await db`select * from public.instructors where user_id = ${existing.data.user!.id}`).toHaveLength(0);
      const direct = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      expect((await direct.auth.signInWithPassword({ email: existingEmail, password: "Existing password 123" })).error).toBeNull();
      const recipientLogin = await post("/api/instructor/sign-in", { email: recipientEmail, password: temporaryPassword });
      expect(recipientLogin.headers.get("location")).toBe("/password-setup");
      const recipientSetup = await post("/api/instructor/password-setup", { password: "Recipient new password 123", confirmation: "Recipient new password 123" }, cookieFrom(recipientLogin));
      expect(recipientSetup.headers.get("location")).toBe("/");
      const recipientCookie = cookieFrom(recipientSetup);
      expect((await post(createPath, { email: secondEmail, password: temporaryPassword }, recipientCookie)).status).toBe(403);
      expect((await post("/api/instructor/sign-in", { email: recipientEmail, password: temporaryPassword })).headers.get("location")).toContain("error=");

      const second = await post(createPath, { email: secondEmail, password: "pass  word12" }, creatorCookie);
      expect(second.status).toBe(201);
      const secondRows = await db<{ id: string }[]>`select id from auth.users where email = ${secondEmail}`;
      const secondId = secondRows[0]!.id;
      createdIds.push(secondId);
      // Force revocation between Auth creation and enrollment: the final
      // authorization check must see the revoked flag and leave no access.
      const racingEmail = `racing-${crypto.randomUUID()}@example.test`;
      let racingRequest: Promise<Response> | undefined;
      await db.begin(async (tx) => {
        await tx`select user_id from public.instructors where user_id = ${creatorId} for update`;
        racingRequest = post(createPath, { email: racingEmail, password: temporaryPassword }, creatorCookie);
        let found = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          if ((await db`select id from auth.users where email = ${racingEmail}`).length) { found = true; break; }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        expect(found).toBe(true);
        await tx`update public.instructors set can_create_instructors = false where user_id = ${creatorId}`;
      });
      expect((await racingRequest!).status).toBe(400);
      expect(await db`select id from auth.users where email = ${racingEmail}`).toHaveLength(0);
      expect((await post(createPath, { email: `denied-${crypto.randomUUID()}@example.test`, password: temporaryPassword }, creatorCookie)).status).toBe(403);
      expect((await fetch(`${BASE_URL}/admin/instructors/new`, { headers: { cookie: creatorCookie } })).status).toBe(404);
      expect((await fetch(`${BASE_URL}/api/admin/case-types`, { headers: { cookie: recipientCookie } })).status).toBe(200);

      expect((await admin.auth.admin.deleteUser(recipientId)).error).toBeNull();
      expect(await db`select * from public.instructor_creations where instructor_id = ${recipientId}`).toHaveLength(0);
      expect(await db`select * from public.instructor_creations where instructor_id = ${secondId}`).toHaveLength(1);
      expect((await admin.auth.admin.deleteUser(creatorId)).error).toBeNull();
      expect(await db`select * from public.instructor_creations where instructor_id = ${secondId}`).toHaveLength(0);
      expect(await db`select * from public.instructors where user_id = ${secondId}`).toHaveLength(1);
    } finally {
      for (const id of createdIds) await admin.auth.admin.deleteUser(id);
      await db.end();
    }
  });

  it("does not expose creation records or the creation flag through API roles", async () => {
    for (const key of [process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, process.env.SUPABASE_SERVICE_ROLE_KEY!]) {
      for (const table of ["instructors", "instructor_creations"]) {
        const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}`, {
          headers: { apikey: key, authorization: `Bearer ${key}` },
        });
        expect(response.ok).toBe(false);
      }
    }
    const db = connectTestDb();
    try {
      for (const role of ["anon", "authenticated", "service_role"]) {
        for (const table of ["public.instructors", "public.instructor_creations"]) {
          const rows = await db<{ allowed: boolean }[]>`select has_table_privilege(${role}, ${table}, 'SELECT,INSERT,UPDATE,DELETE') as allowed`;
          expect(rows[0]!.allowed).toBe(false);
        }
      }
    } finally {
      await db.end();
    }
  });
});
