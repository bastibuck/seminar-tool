import { notFound } from "next/navigation";

import { getCaseTypeDetail } from "@/lib/admin";
import { requireInstructorPage } from "@/lib/instructor-auth";
import { InstructorSession } from "@/app/instructor-session";

export const dynamic = "force-dynamic";

export default async function NewFindingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const instructor = await requireInstructorPage(`/admin/case-types/${encodeURIComponent(id)}/findings/new`);
  const detail = await getCaseTypeDetail(id);
  if (!detail) notFound();
  return (
    <InstructorSession email={instructor.email} sessionKey={instructor.session_key} remainingMs={instructor.expires_at.getTime() - Date.now()}><main style={{ fontFamily: "system-ui, sans-serif", maxWidth: "40rem", margin: "0 auto", padding: "2rem" }}>
      <p><a href={`/admin/case-types/${id}`}>← Zurück zum Falltyp</a></p>
      <h1>Neuen Befund anlegen</h1>
      <form action={`/api/admin/case-types/${id}?instructor_session=${instructor.session_key}`} method="post" encType="multipart/form-data">
        <label>Name<input name="name" required /></label>
        <label>Bild<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
        <button type="submit">Befund anlegen</button>
      </form>
    </main></InstructorSession>
  );
}
