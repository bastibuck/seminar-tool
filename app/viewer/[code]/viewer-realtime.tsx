"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import type { ReleasedFinding } from "@/lib/cases";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type FindingView = {
  id: string;
  name: string;
  note: string | null;
  releasedAt: string;
  imageUrl: string;
};

type ViewerQueryData = {
  ended: boolean;
  findings: FindingView[];
};

type ViewerRealtimeProps = {
  caseId: string;
  caseCode: string;
  initialFindings: ReleasedFinding[];
  initialEnded: boolean;
};

const timeFormat = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Europe/Berlin",
});

function mapFindings(raw: FindingView[]): ReleasedFinding[] {
  return raw.map((f) => ({
    id: f.id,
    name: f.name,
    note: f.note,
    releasedAt: new Date(f.releasedAt),
    imageUrl: f.imageUrl,
  }));
}

export function ViewerRealtime({
  caseId,
  caseCode,
  initialFindings,
  initialEnded,
}: ViewerRealtimeProps) {
  const queryClient = useQueryClient();
  const [expandedImage, setExpandedImage] = useState<FindingView | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const queryKey = ["viewer", caseCode] as const;

  const { data } = useQuery<ViewerQueryData>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/viewer/${caseCode}`);
      if (!response.ok) return undefined;
      return response.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    initialData: {
      ended: initialEnded,
      findings: initialFindings.map((f) => ({
        id: f.id,
        name: f.name,
        note: f.note,
        releasedAt: f.releasedAt.toISOString(),
        imageUrl: f.imageUrl,
      })),
    },
  });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const channel = supabase
      .channel(`viewer-${caseId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "releases",
          filter: `case_id=eq.${caseId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "cases",
          filter: `id=eq.${caseId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [caseId, queryClient, queryKey]);

  const findings = data ? mapFindings(data.findings) : [];
  const ended = data?.ended ?? initialEnded;

  useEffect(() => {
    if (!expandedImage) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedImage]);

  function openImage(finding: ReleasedFinding) {
    setZoomed(false);
    setExpandedImage({ ...finding, releasedAt: finding.releasedAt.toISOString() });
  }

  return (
    <section aria-label="Freigegebene Befunde">
      {ended ? <p className="status">Fall beendet</p> : null}
      {findings.length === 0 ? (
        <p className="empty">Warte auf freigegebene Befunde...</p>
      ) : (
        <>
          <h2>Befunde</h2>
          <ol className="finding-grid">
            {findings.map((finding) => (
              <li key={finding.id} className="finding-card">
                <img
                  src={finding.imageUrl}
                  alt={finding.name}
                  className="finding-card__image"
                  onClick={() => openImage(finding)}
                />
                <div className="finding-card__body">
                <strong>{finding.name}</strong>
                {finding.note ? <p>{finding.note}</p> : null}
                <p className="finding-card__time">
                  Freigegeben um{" "}
                  <time dateTime={finding.releasedAt.toISOString()}>
                    {timeFormat.format(finding.releasedAt)}
                  </time>{" "}
                  Uhr
                </p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {expandedImage ? (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${expandedImage.name} vergrößert`}>
          <div className="lightbox__bar">
            <span className="lightbox__title">{expandedImage.name}</span>
            <button ref={closeButtonRef} className="button button--secondary" type="button" onClick={() => setExpandedImage(null)}>Schließen</button>
          </div>
          <div className="lightbox__image-wrap">
            <img src={expandedImage.imageUrl} alt={expandedImage.name} className={`lightbox__image${zoomed ? " lightbox__image--zoomed" : ""}`} onClick={() => setZoomed((value) => !value)} />
          </div>
          <div className="lightbox__bar"><span>{zoomed ? "Zum Verkleinern auf das Bild klicken" : "Zum Vergrößern auf das Bild klicken"}</span><button className="button button--secondary" type="button" onClick={() => setZoomed((value) => !value)}>{zoomed ? "Verkleinern" : "Vergrößern"}</button></div>
        </div>
      ) : null}
    </section>
  );
}
