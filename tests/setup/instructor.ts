import { createClient } from "@supabase/supabase-js";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    instructorCookie: string;
  }
}

export async function provisionInstructor(project: TestProject, baseUrl: string) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `test-${crypto.randomUUID()}@example.test`;
  const temporaryPassword = "Temporary password 123";
  const password = "A different password 123";
  const { data, error } = await admin.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("Could not create test Instructor");
  try {
    const login = await fetch(`${baseUrl}/api/instructor/sign-in`, {
      method: "POST", redirect: "manual",
      body: new URLSearchParams({ email, password: temporaryPassword }),
    });
    if (login.headers.get("location") !== "/password-setup") throw new Error("Test Instructor sign-in failed");
    const temporaryCookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const setup = await fetch(`${baseUrl}/api/instructor/password-setup`, {
      method: "POST", redirect: "manual", headers: { cookie: temporaryCookie },
      body: new URLSearchParams({ password, confirmation: password }),
    });
    if (setup.headers.get("location") !== "/") throw new Error("Test Instructor password setup failed");
    const cookie = setup.headers.getSetCookie().find((value) => value.startsWith("instructor_session=") && !value.includes("Max-Age=0"));
    if (!cookie) throw new Error("Test Instructor session cookie missing");
    project.provide("instructorCookie", cookie.split(";")[0]!);
    return () => admin.auth.admin.deleteUser(data.user!.id);
  } catch (error) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw error;
  }
}
