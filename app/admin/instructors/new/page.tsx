import { notFound } from "next/navigation";

import { InstructorSession } from "@/app/instructor-session";
import { requireInstructorPage } from "@/lib/instructor-auth";
import { canCreateInstructors } from "@/lib/instructor-creation";

import { InstructorForm } from "./instructor-form";

export const dynamic = "force-dynamic";

export default async function NewInstructorPage() {
  const instructor = await requireInstructorPage("/admin/instructors/new");
  if (!(await canCreateInstructors(instructor.user_id))) notFound();

  return (
    <InstructorSession email={instructor.email} sessionKey={instructor.session_key} remainingMs={instructor.expires_at.getTime() - Date.now()}>
      <main className="shell shell--narrow">
        <p className="eyebrow">Kursleitung</p>
        <p><a href="/admin">← Zurück zu den Falltypen</a></p>
        <h1>Kursleitung hinzufügen</h1>
        <p className="lede">Prüfe die Identität und E-Mail-Adresse der Person. Teile das vorläufige Passwort ausschließlich vertraulich mit ihr, zum Beispiel mündlich.</p>
        <InstructorForm />
      </main>
    </InstructorSession>
  );
}
