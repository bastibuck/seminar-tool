"use client";

import { useRef, useState } from "react";

import { ReleaseDialog } from "./release-dialog";

type FindingState = {
  id: string;
  name: string;
  releasedAt: string | null;
};

type CockpitClientProps = {
  cockpitId: string;
  findings: FindingState[];
  endedAt: string | null;
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

export function CockpitClient({
  cockpitId,
  findings: initialFindings,
  endedAt: initialEndedAt,
}: CockpitClientProps) {
  const [findings, setFindings] = useState<FindingState[]>(initialFindings);
  const [endedAt, setEndedAt] = useState<string | null>(initialEndedAt);
  const [error, setError] = useState<string | null>(null);
  const [loadingFindingId, setLoadingFindingId] = useState<string | null>(null);
  const [loadingEnd, setLoadingEnd] = useState(false);
  const endDialogRef = useRef<HTMLDialogElement>(null);

  function setFindingReleased(findingId: string, releasedAt: string | null) {
    setFindings((prev) =>
      prev.map((finding) =>
        finding.id === findingId ? { ...finding, releasedAt } : finding,
      ),
    );
  }

  async function toggleRelease(findingId: string, note: string) {
    const current = findings.find((finding) => finding.id === findingId);
    if (!current || loadingFindingId || endedAt) return;

    const previous = findings;
    const optimisticReleasedAt = current.releasedAt
      ? null
      : new Date().toISOString();

    setError(null);
    setFindingReleased(findingId, optimisticReleasedAt);
    setLoadingFindingId(findingId);

    const body = new URLSearchParams({
      findingId,
      intent: current.releasedAt ? "unrelease" : "release",
    });
    if (current.releasedAt === null && note) body.set("note", note);

    try {
      const response = await fetch(`/api/cases/${cockpitId}/releases`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (response.ok) {
        const data = await response.json();
        setFindingReleased(
          findingId,
          typeof data.releasedAt === "string" ? data.releasedAt : optimisticReleasedAt,
        );
        return;
      }
      let message = "Aktion fehlgeschlagen.";
      try {
        const data = await response.json();
        if (data && typeof data.error === "string") message = data.error;
      } catch {}
      if (response.status === 409) setEndedAt(new Date().toISOString());
      setFindings(previous);
      setError(message);
    } catch {
      setFindings(previous);
      setError("Aktion fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setLoadingFindingId(null);
    }
  }

  async function confirmEnd() {
    if (loadingEnd) return;
    const previousEndedAt = endedAt;
    closeEndDialog();
    setError(null);
    setEndedAt(new Date().toISOString());
    setLoadingEnd(true);

    try {
      const response = await fetch(`/api/cases/${cockpitId}/end`, {
        method: "POST",
      });
      if (response.ok) {
        const data = await response.json();
        if (typeof data.endedAt === "string") setEndedAt(data.endedAt);
        return;
      }
      let message = "Aktion fehlgeschlagen.";
      try {
        const data = await response.json();
        if (data && typeof data.error === "string") message = data.error;
      } catch {}
      setEndedAt(previousEndedAt);
      setError(message);
    } catch {
      setEndedAt(previousEndedAt);
      setError("Aktion fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setLoadingEnd(false);
    }
  }

  function openEndDialog() {
    endDialogRef.current?.showModal();
  }

  function closeEndDialog() {
    endDialogRef.current?.close();
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
                    disabled={loadingFindingId === finding.id}
                    onClick={() => toggleRelease(finding.id, "")}
                  >
                    {loadingFindingId === finding.id
                      ? "Wird zurückgezogen…"
                      : "Zurückziehen"}
                  </button>
                ) : (
                  <ReleaseDialog
                    findingId={finding.id}
                    findingName={finding.name}
                    disabled={loadingFindingId === finding.id}
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
            disabled={loadingEnd}
            onClick={confirmEnd}
          >
            {loadingEnd ? "Wird beendet…" : "Fall jetzt beenden"}
          </button>
        </div>
      </dialog>
    </>
  );
}
