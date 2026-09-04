"use client";

import { useRef, useState } from "react";

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
      <button className="button" type="button" onClick={handleOpen} disabled={disabled}>
        Freigeben
      </button>
      <dialog className="dialog" ref={dialogRef}><div className="dialog__body">
        <p className="eyebrow">Befund freigeben</p><h2>Befund freigeben</h2>
        <p>
          <strong>{findingName}</strong>
        </p>
        <form onSubmit={handleSubmit}>
          <div className="release-note">
            <label htmlFor={`note-${findingId}`}>Notiz für die Studierenden <span>optional</span></label>
            <p>Ergänze nur den Kontext, den die Gruppe mit diesem Befund erhalten soll.</p>
            <textarea
              id={`note-${findingId}`}
              name="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="z. B. Die Aufnahme wurde bei der Erstuntersuchung erstellt."
            />
          </div>
          <div className="button-row button-row--end">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => dialogRef.current?.close()}
            >
              Abbrechen
            </button>
            <button className="button" type="submit">
              Freigeben
            </button>
          </div>
        </form>
      </div></dialog>
    </>
  );
}
