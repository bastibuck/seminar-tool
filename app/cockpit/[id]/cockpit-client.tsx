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
        <p role="alert" className="alert">
          {error}
        </p>
      ) : null}
      <section aria-label="Befunde">
        <h2>Befunde</h2>
          <ol className="cockpit-list">
            {findings.map((finding) => (
            <li data-finding-id={finding.id} className="cockpit-item" key={finding.id}>
              <div className="cockpit-item__main"><strong>{finding.name}</strong>
              {finding.releasedAt ? (
                <p className="cockpit-item__state" style={{ color: "var(--teal-dark)" }}>
                  Freigegeben um{" "}
                  <time dateTime={finding.releasedAt}>
                    {formatTime(finding.releasedAt)}
                  </time>{" "}
                  Uhr
                </p>
              ) : (
                <p className="cockpit-item__state" style={{ color: "var(--muted)" }}>Zurückgehalten</p>
              )}
              </div>
              {!endedAt ? (
                finding.releasedAt ? (
                  <button className="button button--secondary"
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
        <p className="status">
          Beendet um{" "}
          <time dateTime={endedAt}>{formatTime(endedAt)}</time> Uhr – es können
          keine Befunde mehr freigegeben oder zurückgezogen werden.
        </p>
      ) : (
        <button
          type="button"
          data-action="end"
          className="button button--danger"
          onClick={openEndDialog}
        >
          Fall beenden
        </button>
      )}
      <dialog ref={endDialogRef} className="dialog"><div className="dialog__body">
        <p className="eyebrow">Fall abschließen</p><h2>Fall beenden</h2>
        <p>
          Möchtest du den Fall jetzt beenden? Das Beenden ist endgültig und kann
          nicht rückgängig gemacht werden. Danach können keine Befunde mehr
          freigegeben oder zurückgezogen werden.
        </p>
        <div role="note" className="warning">
          Die bereits freigegebenen Befunde bleiben für die Studierenden
          sichtbar.
        </div>
        <div className="button-row button-row--end">
          <button
            type="button"
            className="button button--secondary"
            onClick={closeEndDialog}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="button button--danger"
            disabled={endMutation.isPending}
            onClick={confirmEnd}
          >
            {endMutation.isPending ? "Wird beendet…" : "Fall jetzt beenden"}
          </button>
        </div>
      </div></dialog>
    </>
  );
}
