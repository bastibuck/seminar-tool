import { notFound } from "next/navigation";

import { getCaseTypeDetail } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function NewFindingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getCaseTypeDetail(id);
  if (!detail) notFound();
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: "40rem", margin: "0 auto", padding: "2rem" }}>
      <p><a href={`/admin/case-types/${id}`}>← Zurück zum Falltyp</a></p>
      <h1>Neuen Befund anlegen</h1>
      <form action={`/api/admin/case-types/${id}`} method="post" encType="multipart/form-data">
        <label>Name<input name="name" required /></label>
        <label>Bild<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
        <button type="submit">Befund anlegen</button>
      </form>
    </main>
  );
}
