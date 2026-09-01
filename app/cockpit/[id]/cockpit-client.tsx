"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { ReleaseDialog } from "./release-dialog";

type FindingState = {
  id: string;
  name: string;
  releasedAt: string | null;
};

type CockpitQueryData = {
  endedAt: string | null;
  findings: FindingState[];
};

type CockpitClientProps = CockpitQueryData & {
  cockpitId: string;
};

const releaseTimeFormat = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Europe/Berlin",
});

const releasedBadgeStyle = {
  color: "#1a7f37",
  fontWeight: 600,
} as const;

const heldBackBadgeStyle = {
  color: "#57606a",
} as const;

const endedNoteStyle = {
  marginTop: "1.5rem",
  color: "#57606a",
} as const;

const endButtonStyle = {
  marginTop: "2rem",
  padding: "0.6rem 1.2rem",
  fontSize: "1rem",
  cursor: "pointer",
} as const;

const dialogStyle = {
  backgroundColor: "#fff",
  borderRadius: "8px",
  padding: "1.5rem",
  maxWidth: "28rem",
  width: "90%",
  boxShadow: "0 4px 24px rgba(0, 0, 0, 0.15)",
} as const;

const warningStyle = {
  padding: "1rem",
  border: "1px solid #d0d7de",
  borderRadius: "6px",
  margin: "1rem 0",
} as const;

const confirmEndButtonStyle = {
  padding: "0.5rem 1rem",
  fontSize: "1rem",
  cursor: "pointer",
  backgroundColor: "#b00020",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
} as const;

const cancelButtonStyle = {
  padding: "0.5rem 1rem",
  fontSize: "1rem",
  cursor: "pointer",
  backgroundColor: "#f6f8fa",
  border: "1px solid #d0d7de",
  borderRadius: "4px",
} as const;

const buttonRowStyle = {
  display: "flex",
  gap: "0.5rem",
  justifyContent: "flex-end",
  marginTop: "1rem",
} as const;

function formatTime(iso: string): string {
  return releaseTimeFormat.format(new Date(iso));
}

async function postFormAction(body: URLSearchParams, url: string): Promise<void> {
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
}

type ReleaseVariables = {
  findingId: string;
  intent: "release" | "unrelease";
  note: string;
};

export function CockpitClient({
  cockpitId,
  findings: initialFindings,
  endedAt: initialEndedAt,
}: CockpitClientProps) {
  const queryClient = useQueryClient();
  const queryKey = ["cockpit", cockpitId] as const;
  const [error, setError] = useState<string | null>(null);
  const endDialogRef = useRef<HTMLDialogElement>(null);

  const { data } = useQuery<CockpitQueryData>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/cases/${cockpitId}`);
      if (!response.ok) throw new Error("Fall konnte nicht geladen werden.");
      return response.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    initialData: {
      endedAt: initialEndedAt,
      findings: initialFindings,
    },
  });

  const releaseMutation = useMutation({
    mutationFn: ({ findingId, intent, note }: ReleaseVariables) =>
      postFormAction(
        new URLSearchParams({
          findingId,
          intent,
          ...(intent === "release" && note ? { note } : {}),
        }),
        `/api/cases/${cockpitId}/releases`,
      ),
    onMutate: async ({ findingId, intent }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CockpitQueryData>(queryKey);
      if (previous) {
        queryClient.setQueryData<CockpitQueryData>(queryKey, {
          ...previous,
          findings: previous.findings.map((finding) =>
            finding.id === findingId
              ? {
                  ...finding,
                  releasedAt:
                    intent === "release" ? new Date().toISOString() : null,
                }
              : finding,
          ),
        });
      }
      return { previous };
    },
    onError: (mutError, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      setError(mutError.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const endMutation = useMutation({
    mutationFn: () => postFormAction(new URLSearchParams(), `/api/cases/${cockpitId}/end`),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CockpitQueryData>(queryKey);
      if (previous) {
        queryClient.setQueryData<CockpitQueryData>(queryKey, {
          ...previous,
          endedAt: new Date().toISOString(),
        });
      }
      return { previous };
    },
    onError: (mutError, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      setError(mutError.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const findings = data?.findings ?? initialFindings;
  const endedAt = data?.endedAt ?? initialEndedAt;
  const pendingFindingId = releaseMutation.isPending
    ? (releaseMutation.variables?.findingId ?? null)
    : null;

  async function toggleRelease(findingId: string, note: string) {
    if (releaseMutation.isPending || endedAt) return;
    const current = findings.find((finding) => finding.id === findingId);
    if (!current) return;
    setError(null);
    releaseMutation.mutate({
      findingId,
      intent: current.releasedAt ? "unrelease" : "release",
      note,
    });
  }

  function openEndDialog() {
    endDialogRef.current?.showModal();
  }

  function closeEndDialog() {
    endDialogRef.current?.close();
  }

  function confirmEnd() {
    if (endMutation.isPending || endedAt) return;
    closeEndDialog();
    setError(null);
    endMutation.mutate();
  }

  return (
    <>
      {error ? (
        <p role="alert" style={{ color: "#b00020" }}>
          {error}
        </p>
      ) : null}
      <section aria-label="Befunde">
        <h2>Befunde</h2>
        <ol>
          {findings.map((finding) => (
            <li key={finding.id} data-finding-id={finding.id}>
              <strong>{finding.name}</strong>
              {finding.releasedAt ? (
                <p style={releasedBadgeStyle}>
                  Freigegeben um{" "}
                  <time dateTime={finding.releasedAt}>
                    {formatTime(finding.releasedAt)}
                  </time>{" "}
                  Uhr
                </p>
              ) : (
                <p style={heldBackBadgeStyle}>Zurückgehalten</p>
              )}
              {!endedAt ? (
                finding.releasedAt ? (
                  <button
                    type="button"
                    data-action="unrelease"
                    disabled={pendingFindingId === finding.id}
                    onClick={() => toggleRelease(finding.id, "")}
                  >
                    {pendingFindingId === finding.id
                      ? "Wird zurückgezogen…"
                      : "Zurückziehen"}
                  </button>
                ) : (
                  <ReleaseDialog
                    findingId={finding.id}
                    findingName={finding.name}
                    disabled={pendingFindingId === finding.id}
                    onRelease={(note) => toggleRelease(finding.id, note)}
                  />
                )
              ) : null}
            </li>
          ))}
        </ol>
      </section>
      {endedAt ? (
        <p style={endedNoteStyle}>
          Beendet um{" "}
          <time dateTime={endedAt}>{formatTime(endedAt)}</time> Uhr – es können
          keine Befunde mehr freigegeben oder zurückgezogen werden.
        </p>
      ) : (
        <button
          type="button"
          data-action="end"
          style={endButtonStyle}
          onClick={openEndDialog}
        >
          Fall beenden
        </button>
      )}
      <dialog ref={endDialogRef} style={dialogStyle}>
        <h3 style={{ marginTop: 0 }}>Fall beenden</h3>
        <p>
          Möchtest du den Fall jetzt beenden? Das Beenden ist endgültig und kann
          nicht rückgängig gemacht werden. Danach können keine Befunde mehr
          freigegeben oder zurückgezogen werden.
        </p>
        <div role="note" style={warningStyle}>
          Die bereits freigegebenen Befunde bleiben für die Studierenden
          sichtbar.
        </div>
        <div style={buttonRowStyle}>
          <button
            type="button"
            style={cancelButtonStyle}
            onClick={closeEndDialog}
          >
            Abbrechen
          </button>
          <button
            type="button"
            style={confirmEndButtonStyle}
            disabled={endMutation.isPending}
            onClick={confirmEnd}
          >
            {endMutation.isPending ? "Wird beendet…" : "Fall jetzt beenden"}
          </button>
        </div>
      </dialog>
    </>
  );
}
