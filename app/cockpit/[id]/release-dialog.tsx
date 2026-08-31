"use client";

import { useRef, useState } from "react";

const overlayStyle = {
  position: "fixed" as const,
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

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
  cockpitId: string;
  findingId: string;
  findingName: string;
};

export function ReleaseDialog({
  cockpitId,
  findingId,
  findingName,
}: ReleaseDialogProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  function handleOpen() {
    setNote("");
    dialogRef.current?.showModal();
    setOpen(true);
  }

  function handleClose() {
    dialogRef.current?.close();
    setOpen(false);
  }

  return (
    <>
      <button type="button" onClick={handleOpen}>
        Freigeben
      </button>
      <dialog
        ref={dialogRef}
        style={dialogStyle}
        onClose={handleClose}
      >
        <h3 style={{ marginTop: 0 }}>Befund freigeben</h3>
        <p>
          <strong>{findingName}</strong>
        </p>
        <form
          method="post"
          action={`/api/cases/${cockpitId}/releases`}
        >
          <input type="hidden" name="findingId" value={findingId} />
          <input type="hidden" name="intent" value="release" />
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
              onClick={handleClose}
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
