"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import Link from "next/link";

type AdminCaseType = {
  id: string;
  name: string;
};

type InsertTypeResult = { id: string };

const fieldStyle = {
  display: "block",
  width: "100%",
  marginBottom: "0.5rem",
  padding: "0.5rem",
  fontSize: "1rem",
} as const;

const buttonStyle = {
  padding: "0.4rem 0.9rem",
  fontSize: "0.95rem",
  cursor: "pointer",
} as const;

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  padding: "0.5rem 0",
  borderBottom: "1px solid #eaeef2",
} as const;

const inputStyle = {
  flex: 1,
  padding: "0.4rem",
  fontSize: "1rem",
} as const;

async function postForm(url: string, body: URLSearchParams): Promise<InsertTypeResult> {
  const response = await fetch(url, {
    method: "POST",
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
  return response.json();
}

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

export function TypeListClient({
  initialTypes,
}: {
  initialTypes: AdminCaseType[];
}) {
  const queryClient = useQueryClient();
  const queryKey = ["admin", "case-types"] as const;
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const { data } = useQuery<AdminCaseType[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetch("/api/admin/case-types");
      if (!response.ok) throw new Error("Falltypen konnten nicht geladen werden.");
      const body = await response.json();
      return body.caseTypes as AdminCaseType[];
    },
    initialData: initialTypes,
    refetchOnWindowFocus: false,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      postForm(
        "/api/admin/case-types",
        new URLSearchParams({ name }),
      ).then((result) => result.id),
    onSuccess: () => {
      setNewName("");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => setError(err.message),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      mutateForm(
        "/api/admin/case-types",
        "PUT",
        new URLSearchParams({ id, name }),
      ),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      mutateForm(
        "/api/admin/case-types",
        "DELETE",
        new URLSearchParams({ id }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (err) => setError(err.message),
  });

  const types = data ?? initialTypes;

  return (
    <div>
      {error ? (
        <p role="alert" style={{ color: "#b00020" }}>
          {error}
        </p>
      ) : null}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {types.map((type) => (
          <li key={type.id} style={rowStyle} data-type-id={type.id}>
            {editingId === type.id ? (
              <>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  style={inputStyle}
                  autoFocus
                />
                <button
                  type="button"
                  style={buttonStyle}
                  disabled={renameMutation.isPending}
                  onClick={() =>
                    renameMutation.mutate({ id: type.id, name: editName })
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
                <Link href={`/admin/case-types/${type.id}`} style={{ flex: 1 }}>
                  {type.name}
                </Link>
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => {
                    setEditingId(type.id);
                    setEditName(type.name);
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
                      `„${type.name}" wirklich löschen?`,
                    ) && deleteMutation.mutate(type.id)
                  }
                >
                  Löschen
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (newName.trim() === "") return;
          setError(null);
          createMutation.mutate(newName);
        }}
      >
        <label>
          Neuer Falltyp
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            style={fieldStyle}
          />
        </label>
        <button type="submit" style={buttonStyle} disabled={createMutation.isPending}>
          {createMutation.isPending ? "Wird angelegt…" : "Falltyp anlegen"}
        </button>
      </form>
    </div>
  );
}
