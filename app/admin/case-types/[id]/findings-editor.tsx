"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export type EditorFinding = {
  id: string;
  name: string;
  position: number;
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
  body: URLSearchParams,
): Promise<void> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
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
    mutationFn: (name: string) =>
      mutateForm(
        `/api/admin/case-types/${caseTypeId}`,
        "POST",
        new URLSearchParams({ name }),
      ),
    onSuccess: () => {
      setNewName("");
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
                  <span style={{ flex: 1 }}>{finding.name}</span>
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
                        `„${finding.name}" wirklich löschen?`,
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

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (newName.trim() === "") return;
          setError(null);
          addMutation.mutate(newName);
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
        </label>
        <button type="submit" style={buttonStyle} disabled={addMutation.isPending}>
          {addMutation.isPending ? "Wird angelegt…" : "Befund hinzufügen"}
        </button>
      </form>
    </div>
  );
}
