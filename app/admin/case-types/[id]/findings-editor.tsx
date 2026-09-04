"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export type EditorFinding = {
  id: string;
  name: string;
  position: number;
  imageUrl?: string;
};

const fieldStyle = {
  display: "block",
  width: "100%",
  marginBottom: "0.5rem",
  padding: "0.5rem",
  fontSize: "1rem",
} as const;

const buttonStyle = {
  padding: "0.4rem 0.8rem",
  fontSize: "0.9rem",
  cursor: "pointer",
} as const;

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.5rem 0",
  borderBottom: "1px solid #eaeef2",
} as const;

async function mutateForm(
  url: string,
  method: string,
  body: BodyInit,
): Promise<void> {
  const response = await fetch(url, {
    method,
    ...(body instanceof URLSearchParams ? { headers: { "content-type": "application/x-www-form-urlencoded" } } : {}),
    body,
  });
  if (!response.ok) {
    let message = "Aktion fehlgeschlagen.";
    try {
      const data = await response.json();
      if (data && typeof data.error === "string") message = data.error;
    } catch {}
    throw new Error(message);
  }
}

export function FindingsEditor({
  caseTypeId,
  initialFindings,
}: {
  caseTypeId: string;
  initialFindings: EditorFinding[];
}) {
  const queryClient = useQueryClient();
  const queryKey = ["admin", "case-types", caseTypeId] as const;
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newImage, setNewImage] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const { data } = useQuery<EditorFinding[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/admin/case-types/${caseTypeId}`);
      if (!response.ok) throw new Error("Befunde konnten nicht geladen werden.");
      const body = await response.json();
      return body.findings as EditorFinding[];
    },
    initialData: initialFindings,
    refetchOnWindowFocus: false,
  });

  const addMutation = useMutation({
    mutationFn: ({ name, image }: { name: string; image: File }) => {
      const body = new FormData();
      body.set("name", name);
      body.set("image", image);
      return mutateForm(`/api/admin/case-types/${caseTypeId}`, "POST", body);
    },
    onSuccess: () => {
      setNewName("");
      setNewImage(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => setError(err.message),
  });

  const renameMutation = useMutation({
    mutationFn: ({ findingId, name }: { findingId: string; name: string }) =>
      mutateForm(
        `/api/admin/case-types/${caseTypeId}`,
        "PATCH",
        new URLSearchParams({ findingId, name }),
      ),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (findingId: string) =>
      mutateForm(
        `/api/admin/case-types/${caseTypeId}`,
        "DELETE",
        new URLSearchParams({ findingId }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (err) => setError(err.message),
  });

  const swapMutation = useMutation({
    mutationFn: ({
      findingA,
      findingB,
    }: {
      findingA: string;
      findingB: string;
    }) =>
      mutateForm(
        `/api/admin/case-types/${caseTypeId}`,
        "PUT",
        new URLSearchParams({ findingA, findingB }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (err) => setError(err.message),
  });

  const findings = (data ?? initialFindings)
    .slice()
    .sort((a, b) => a.position - b.position);

  function move(finding: EditorFinding, direction: "up" | "down") {
    const index = findings.findIndex((f) => f.id === finding.id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const target = findings[targetIndex];
    if (!target) return;
    setError(null);
    swapMutation.mutate({ findingA: finding.id, findingB: target.id });
  }

  return (
    <div>
      {error ? (
        <p role="alert" style={{ color: "#b00020" }}>
          {error}
        </p>
      ) : null}

      {findings.length === 0 ? (
        <p>Dieser Falltyp hat noch keine Befunde.</p>
      ) : (
        <ol style={{ listStyle: "none", padding: 0 }}>
          {findings.map((finding, index) => (
            <li key={finding.id} style={rowStyle} data-finding-id={finding.id}>
              <span style={{ width: "1.5rem", color: "#57606a" }}>
                {index + 1}.
              </span>
              {editingId === finding.id ? (
                <>
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    style={{ flex: 1, padding: "0.4rem", fontSize: "1rem" }}
                    autoFocus
                  />
                  <button
                    type="button"
                    style={buttonStyle}
                    disabled={renameMutation.isPending}
                    onClick={() =>
                      renameMutation.mutate({
                        findingId: finding.id,
                        name: editName,
                      })
                    }
                  >
                    Speichern
                  </button>
                  <button
                    type="button"
                    style={buttonStyle}
                    onClick={() => setEditingId(null)}
                  >
                    Abbrechen
                  </button>
                </>
              ) : (
                <>
                   <span style={{ flex: 1 }}>
                     {finding.imageUrl ? <img src={finding.imageUrl} alt="" style={{ width: "3rem", height: "3rem", objectFit: "contain", verticalAlign: "middle", marginRight: "0.5rem" }} /> : null}
                     <a href={`/admin/findings/${finding.id}`}>{finding.name}</a>
                   </span>
                  <button
                    type="button"
                    style={buttonStyle}
                    disabled={index === 0 || swapMutation.isPending}
                    onClick={() => move(finding, "up")}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    style={buttonStyle}
                    disabled={index === findings.length - 1 || swapMutation.isPending}
                    onClick={() => move(finding, "down")}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    style={buttonStyle}
                    onClick={() => {
                      setEditingId(finding.id);
                      setEditName(finding.name);
                    }}
                  >
                    Umbenennen
                  </button>
                  <button
                    type="button"
                    style={buttonStyle}
                    disabled={deleteMutation.isPending}
                    onClick={() =>
                       window.confirm(
                         `„${finding.name}" und sein Bild wirklich löschen?`,
                      ) && deleteMutation.mutate(finding.id)
                    }
                  >
                    Löschen
                  </button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      <p><a href={`/admin/case-types/${caseTypeId}/findings/new`}>Befund auf eigener Seite anlegen</a></p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (newName.trim() === "" || !newImage) return;
          setError(null);
          addMutation.mutate({ name: newName, image: newImage });
        }}
        style={{ marginTop: "1rem" }}
      >
        <label>
           Neuer Befund
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            style={fieldStyle}
         />
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setNewImage(event.target.files?.[0] ?? null)} />
         </label>
        <button type="submit" style={buttonStyle} disabled={addMutation.isPending}>
          {addMutation.isPending ? "Wird angelegt…" : "Befund hinzufügen"}
        </button>
      </form>
    </div>
  );
}
