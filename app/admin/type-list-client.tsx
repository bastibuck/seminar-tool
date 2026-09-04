"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

type AdminCaseType = { id: string; name: string };
type InsertTypeResult = { id: string };

async function request(url: string, method: string, body: URLSearchParams): Promise<InsertTypeResult | undefined> {
  const response = await fetch(url, { method, headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
  if (!response.ok) {
    let message = "Aktion fehlgeschlagen.";
    try { const data = await response.json(); if (typeof data.error === "string") message = data.error; } catch {}
    throw new Error(message);
  }
  return method === "POST" ? response.json() : undefined;
}

export function TypeListClient({ initialTypes }: { initialTypes: AdminCaseType[] }) {
  const queryClient = useQueryClient();
  const queryKey = ["admin", "case-types"] as const;
  const createDialogRef = useRef<HTMLDialogElement>(null);
  const renameDialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<AdminCaseType | null>(null);
  const { data } = useQuery<AdminCaseType[]>({ queryKey, queryFn: async () => { const response = await fetch("/api/admin/case-types"); if (!response.ok) throw new Error("Falltypen konnten nicht geladen werden."); return (await response.json()).caseTypes; }, initialData: initialTypes, refetchOnWindowFocus: false });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const createMutation = useMutation({ mutationFn: (value: string) => request("/api/admin/case-types", "POST", new URLSearchParams({ name: value })), onSuccess: () => { createDialogRef.current?.close(); setName(""); refresh(); }, onError: (err) => setError(err.message) });
  const renameMutation = useMutation({ mutationFn: ({ id, value }: { id: string; value: string }) => request("/api/admin/case-types", "PUT", new URLSearchParams({ id, name: value })), onSuccess: () => { renameDialogRef.current?.close(); refresh(); }, onError: (err) => setError(err.message) });
  const deleteMutation = useMutation({ mutationFn: (id: string) => request("/api/admin/case-types", "DELETE", new URLSearchParams({ id })), onSuccess: () => { deleteDialogRef.current?.close(); refresh(); }, onError: (err) => setError(err.message) });
  const types = data ?? initialTypes;
  const openRename = (type: AdminCaseType) => { setError(null); setSelected(type); setName(type.name); renameDialogRef.current?.showModal(); };
  const openDelete = (type: AdminCaseType) => { setError(null); setSelected(type); deleteDialogRef.current?.showModal(); };

  return <>
    {error && !createDialogRef.current?.open && !renameDialogRef.current?.open && !deleteDialogRef.current?.open ? <p role="alert" className="alert">{error}</p> : null}
    <div className="button-row"><button className="button" type="button" onClick={() => { setError(null); setName(""); createDialogRef.current?.showModal(); }}>Falltyp anlegen</button></div>
    {types.length === 0 ? <p className="empty">Lege den ersten Falltyp an, um einen Fall starten zu können.</p> : <ul className="list">{types.map((type) => <li className="list-card" key={type.id} data-type-id={type.id}><div className="list-card__main"><Link className="list-card__title" href={`/admin/case-types/${type.id}`}>{type.name}</Link></div><div className="button-row"><button aria-label={`${type.name} umbenennen`} title="Umbenennen" className="button button--quiet" type="button" onClick={() => openRename(type)}><Pencil size={18} aria-hidden="true" /></button><button aria-label={`${type.name} löschen`} title="Löschen" className="button button--quiet" type="button" onClick={() => openDelete(type)}><Trash2 size={18} aria-hidden="true" /></button></div></li>)}</ul>}
    <dialog className="dialog" ref={createDialogRef}><form className="dialog__body" onSubmit={(event) => { event.preventDefault(); if (name.trim()) createMutation.mutate(name); }}><p className="eyebrow">Neuer Falltyp</p><h2>Falltyp anlegen</h2>{error ? <p role="alert" className="alert">{error}</p> : null}<label className="field">Name des Falltyps<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="z. B. Akuter Thoraxschmerz" /></label><div className="button-row button-row--end"><button className="button button--secondary" type="button" onClick={() => createDialogRef.current?.close()}>Abbrechen</button><button className="button" disabled={createMutation.isPending}>{createMutation.isPending ? "Wird angelegt..." : "Falltyp anlegen"}</button></div></form></dialog>
    <dialog className="dialog" ref={renameDialogRef}><form className="dialog__body" onSubmit={(event) => { event.preventDefault(); if (selected && name.trim()) renameMutation.mutate({ id: selected.id, value: name }); }}><p className="eyebrow">Falltyp</p><h2>Umbenennen</h2>{error ? <p role="alert" className="alert">{error}</p> : null}<label className="field">Name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label><div className="button-row button-row--end"><button className="button button--secondary" type="button" onClick={() => renameDialogRef.current?.close()}>Abbrechen</button><button className="button" disabled={renameMutation.isPending}>Änderung speichern</button></div></form></dialog>
    <dialog className="dialog" ref={deleteDialogRef}><div className="dialog__body"><p className="eyebrow">Falltyp löschen</p><h2>„{selected?.name}“ löschen?</h2>{error ? <p role="alert" className="alert">{error}</p> : null}<p>Der Falltyp und alle dazugehörigen Befunde werden dauerhaft entfernt.</p><p className="warning">Diese Aktion kann nicht rückgängig gemacht werden.</p><div className="button-row button-row--end"><button className="button button--secondary" type="button" onClick={() => deleteDialogRef.current?.close()}>Abbrechen</button><button className="button button--danger" type="button" disabled={!selected || deleteMutation.isPending} onClick={() => selected && deleteMutation.mutate(selected.id)}>{deleteMutation.isPending ? "Wird gelöscht..." : "Endgültig löschen"}</button></div></div></dialog>
  </>;
}
