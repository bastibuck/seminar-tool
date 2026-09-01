"use client";

import { useRef, useState } from "react";

const dialogStyle = {
  backgroundColor: "#fff",
  borderRadius: "8px",
  padding: "1.5rem",
  maxWidth: "28rem",
  width: "90%",
  boxShadow: "0 4px 24px rgba(0, 0, 0, 0.15)",
};

const textareaStyle = {
  width: "100%",
  minHeight: "6rem",
  padding: "0.5rem",
  fontSize: "1rem",
  fontFamily: "system-ui, sans-serif",
  borderRadius: "4px",
  border: "1px solid #d0d7de",
  resize: "vertical" as const,
  boxSizing: "border-box" as const,
};

const buttonRowStyle = {
  display: "flex",
  gap: "0.5rem",
  justifyContent: "flex-end",
  marginTop: "1rem",
};

const confirmButtonStyle = {
  padding: "0.5rem 1rem",
  fontSize: "1rem",
  cursor: "pointer",
  backgroundColor: "#1a7f37",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
};

const cancelButtonStyle = {
  padding: "0.5rem 1rem",
  fontSize: "1rem",
  cursor: "pointer",
  backgroundColor: "#f6f8fa",
  border: "1px solid #d0d7de",
  borderRadius: "4px",
};

type ReleaseDialogProps = {
  findingId: string;
  findingName: string;
  disabled?: boolean;
  onRelease: (note: string) => Promise<void>;
};

export function ReleaseDialog({
  findingId,
  findingName,
  disabled = false,
  onRelease,
}: ReleaseDialogProps) {
  const [note, setNote] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  function handleOpen() {
    setNote("");
    dialogRef.current?.showModal();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dialogRef.current?.close();
    await onRelease(note);
  }

  return (
    <>
      <button type="button" onClick={handleOpen} disabled={disabled}>
        Freigeben
      </button>
      <dialog ref={dialogRef} style={dialogStyle}>
        <h3 style={{ marginTop: 0 }}>Befund freigeben</h3>
        <p>
          <strong>{findingName}</strong>
        </p>
        <form onSubmit={handleSubmit}>
          <label
            htmlFor={`note-${findingId}`}
            style={{ display: "block", marginBottom: "0.25rem" }}
          >
            Notiz (optional)
          </label>
          <textarea
            id={`note-${findingId}`}
            name="note"
            style={textareaStyle}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optionale Notiz für die Studierenden…"
          />
          <div style={buttonRowStyle}>
            <button
              type="button"
              style={cancelButtonStyle}
              onClick={() => dialogRef.current?.close()}
            >
              Abbrechen
            </button>
            <button type="submit" style={confirmButtonStyle}>
              Freigeben
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
