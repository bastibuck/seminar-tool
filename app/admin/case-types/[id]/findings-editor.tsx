"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

export type EditorFinding = {
  id: string;
  name: string;
  position: number;
  imageUrl?: string;
};

async function mutate(url: string, method: string, body: BodyInit) {
  const response = await fetch(url, {
    method,
    ...(body instanceof URLSearchParams
      ? { headers: { "content-type": "application/x-www-form-urlencoded" } }
      : {}),
    body,
  });
  if (response.ok) return;
  let message = "Aktion fehlgeschlagen.";
  try {
    const data = await response.json();
    if (typeof data.error === "string") message = data.error;
  } catch {}
  throw new Error(message);
}

export function FindingsEditor({ caseTypeId, initialFindings }: { caseTypeId: string; initialFindings: EditorFinding[] }) {
  const queryClient = useQueryClient();
  const queryKey = ["admin", "case-types", caseTypeId] as const;
  const createDialogRef = useRef<HTMLDialogElement>(null);
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [editing, setEditing] = useState<EditorFinding | null>(null);
  const [deleting, setDeleting] = useState<EditorFinding | null>(null);
  const { data } = useQuery<EditorFinding[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/admin/case-types/${caseTypeId}`);
      if (!response.ok) throw new Error("Befunde konnten nicht geladen werden.");
      return (await response.json()).findings;
    },
    initialData: initialFindings,
    refetchOnWindowFocus: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const addMutation = useMutation({
    mutationFn: ({ value, file }: { value: string; file: File }) => {
      const body = new FormData();
      body.set("name", value);
      body.set("image", file);
      return mutate(`/api/admin/case-types/${caseTypeId}`, "POST", body);
    },
    onSuccess: () => { createDialogRef.current?.close(); setName(""); setImage(null); refresh(); },
    onError: (err) => setError(err.message),
  });
  const editMutation = useMutation({
    mutationFn: ({ id, value, file }: { id: string; value: string; file: File | null }) => {
      const body = new FormData();
      body.set("name", value);
      if (file) body.set("image", file);
      return mutate(`/api/admin/findings/${id}`, "PATCH", body);
    },
    onSuccess: () => { editDialogRef.current?.close(); setImage(null); refresh(); },
    onError: (err) => setError(err.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (findingId: string) => mutate(`/api/admin/case-types/${caseTypeId}`, "DELETE", new URLSearchParams({ findingId })),
    onSuccess: () => { deleteDialogRef.current?.close(); refresh(); },
    onError: (err) => setError(err.message),
  });
  const swapMutation = useMutation({
    mutationFn: ({ findingA, findingB }: { findingA: string; findingB: string }) => mutate(`/api/admin/case-types/${caseTypeId}`, "PUT", new URLSearchParams({ findingA, findingB })),
    onSuccess: refresh,
    onError: (err) => setError(err.message),
  });
  const findings = (data ?? initialFindings).toSorted((a, b) => a.position - b.position);
  const dialogOpen = createDialogRef.current?.open || editDialogRef.current?.open || deleteDialogRef.current?.open;
  const openEdit = (finding: EditorFinding) => {
    setError(null);
    setEditing(finding);
    setName(finding.name);
    setImage(null);
    editDialogRef.current?.showModal();
  };

  return <>
    {error && !dialogOpen ? <p role="alert" className="alert">{error}</p> : null}
    <div className="button-row"><button className="button" type="button" onClick={() => { setError(null); setName(""); setImage(null); createDialogRef.current?.showModal(); }}>Befund hinzufügen</button></div>
    {findings.length === 0 ? <p className="empty">Diesem Falltyp fehlen noch Befunde.</p> : <ol className="list">{findings.map((finding, index) => <li className="list-card" key={finding.id} data-finding-id={finding.id}>{finding.imageUrl ? <img className="finding-thumb" src={finding.imageUrl} alt="" /> : null}<div className="list-card__main"><strong className="list-card__label">{finding.name}</strong></div><div className="button-row"><button aria-label={`${finding.name} bearbeiten`} title="Bearbeiten" className="button button--quiet" type="button" onClick={() => openEdit(finding)}><Pencil size={18} aria-hidden="true" /></button><button aria-label={`${finding.name} nach oben`} title="Nach oben" className="button button--quiet" disabled={index === 0 || swapMutation.isPending} onClick={() => swapMutation.mutate({ findingA: finding.id, findingB: findings[index - 1].id })}><ArrowUp size={18} aria-hidden="true" /></button><button aria-label={`${finding.name} nach unten`} title="Nach unten" className="button button--quiet" disabled={index === findings.length - 1 || swapMutation.isPending} onClick={() => swapMutation.mutate({ findingA: finding.id, findingB: findings[index + 1].id })}><ArrowDown size={18} aria-hidden="true" /></button><button aria-label={`${finding.name} löschen`} title="Löschen" className="button button--quiet" type="button" onClick={() => { setError(null); setDeleting(finding); deleteDialogRef.current?.showModal(); }}><Trash2 size={18} aria-hidden="true" /></button></div></li>)}</ol>}
    <dialog className="dialog" ref={createDialogRef}><form className="dialog__body" onSubmit={(event) => { event.preventDefault(); if (name.trim() && image) addMutation.mutate({ value: name, file: image }); }}><p className="eyebrow">Neuer Befund</p><h2>Befund hinzufügen</h2>{error ? <p role="alert" className="alert">{error}</p> : null}<label className="field">Name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field">Bild <small>JPEG, PNG oder WebP</small><input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] ?? null)} /></label><div className="button-row button-row--end"><button className="button button--secondary" type="button" onClick={() => createDialogRef.current?.close()}>Abbrechen</button><button className="button" disabled={addMutation.isPending}>{addMutation.isPending ? "Wird angelegt..." : "Befund anlegen"}</button></div></form></dialog>
    <dialog className="dialog" ref={editDialogRef}><form className="dialog__body" onSubmit={(event) => { event.preventDefault(); if (editing && name.trim()) editMutation.mutate({ id: editing.id, value: name, file: image }); }}><p className="eyebrow">Befund bearbeiten</p><h2>{editing?.name}</h2>{error ? <p role="alert" className="alert">{error}</p> : null}<label className="field">Name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label>{editing?.imageUrl ? <img className="finding-edit-preview" src={editing.imageUrl} alt="" /> : null}<label className="field">Bild ersetzen <small>Optional, JPEG, PNG oder WebP</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] ?? null)} /></label><div className="button-row button-row--end"><button className="button button--secondary" type="button" onClick={() => editDialogRef.current?.close()}>Abbrechen</button><button className="button" disabled={editMutation.isPending}>{editMutation.isPending ? "Wird gespeichert..." : "Änderungen speichern"}</button></div></form></dialog>
    <dialog className="dialog" ref={deleteDialogRef}><div className="dialog__body"><p className="eyebrow">Befund löschen</p><h2>„{deleting?.name}“ löschen?</h2>{error ? <p role="alert" className="alert">{error}</p> : null}<p>Der Befund und sein Bild werden dauerhaft entfernt.</p><p className="warning">Diese Aktion kann nicht rückgängig gemacht werden.</p><div className="button-row button-row--end"><button className="button button--secondary" type="button" onClick={() => deleteDialogRef.current?.close()}>Abbrechen</button><button className="button button--danger" type="button" disabled={!deleting || deleteMutation.isPending} onClick={() => deleting && deleteMutation.mutate(deleting.id)}>Endgültig löschen</button></div></div></dialog>
  </>;
}
