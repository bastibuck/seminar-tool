"use client";

import { useState } from "react";

export function FindingEditor({ finding }: { finding: { id: string; name: string; imageUrl: string } }) {
  const [name, setName] = useState(finding.name);
  const [image, setImage] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const body = new FormData();
    body.set("name", name);
    if (image) body.set("image", image);
    const response = await fetch(`/api/admin/findings/${finding.id}`, { method: "PATCH", body });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error ?? "Aktion fehlgeschlagen."); return; }
    setSaved(true);
  }

  return (
    <form onSubmit={submit}>
      {message ? <p role="alert">{message}</p> : null}
      {saved ? <p role="status">Gespeichert.</p> : null}
      <img src={finding.imageUrl} alt={finding.name} style={{ maxWidth: "100%", maxHeight: "18rem", objectFit: "contain" }} />
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Neues Bild (optional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] ?? null)} /></label>
      <button type="submit">Speichern</button>
    </form>
  );
}
