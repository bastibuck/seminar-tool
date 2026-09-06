"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
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
  const viewerSectionRef = useRef<HTMLElement>(null);
  const [expandedImage, setExpandedImage] = useState<FindingView | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [zoomAnnouncement, setZoomAnnouncement] = useState("");
  const lightboxRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const imageTriggerRef = useRef<HTMLImageElement>(null);
  const announceTransformRef = useRef(false);
  const fitScaleRef = useRef(1);
  const fitPositionRef = useRef({ x: 0, y: 0 });
  const transformRef = useRef<ReactZoomPanPinchContentRef | null>(null);
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
      if (event.key === "Escape") {
        event.preventDefault();
        closeImage();
        return;
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const ref = transformRef.current;
      if (ref && (event.key === "+" || event.key === "=")) {
        event.preventDefault();
        changeZoom(ref, 1.25);
      } else if (ref && event.key === "-") {
        event.preventDefault();
        changeZoom(ref, 0.8);
      } else if (ref && event.key === "0") {
        event.preventDefault();
        resetZoom(ref);
      } else if (ref && event.key.startsWith("Arrow")) {
        event.preventDefault();
        const deltas = { ArrowUp: [0, 80], ArrowDown: [0, -80], ArrowLeft: [80, 0], ArrowRight: [-80, 0] } as const;
        const [x, y] = deltas[event.key as keyof typeof deltas];
        void ref.panBy(x, y, 120);
      }
      if (event.key === "Tab") {
        const focusable = lightboxRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)");
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const focusIsInside = lightboxRef.current?.contains(document.activeElement);
        if (!focusIsInside) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedImage]);

  function openImage(finding: ReleasedFinding) {
    setImageLoaded(false);
    setZoomPercent(100);
    setZoomAnnouncement("");
    setExpandedImage({ ...finding, releasedAt: finding.releasedAt.toISOString() });
  }

  function closeImage() {
    transformRef.current?.setTransform(fitPositionRef.current.x, fitPositionRef.current.y, fitScaleRef.current, 0);
    setExpandedImage(null);
    if (imageTriggerRef.current?.isConnected) imageTriggerRef.current.focus();
    else viewerSectionRef.current?.focus();
  }

  function handleTransform(
    ref: ReactZoomPanPinchRef,
    state: { scale: number; positionX: number; positionY: number },
  ) {
    const minScale = fitScaleRef.current;
    const maxScale = minScale * 8;
    const boundedScale = Math.min(maxScale, Math.max(minScale, state.scale));
    if (boundedScale !== state.scale) {
      void ref.setTransform(state.positionX, state.positionY, boundedScale, 0);
    }
    const percent = Math.round((boundedScale / minScale) * 100);
    setZoomPercent(percent);
    if (announceTransformRef.current) {
      setZoomAnnouncement(`Zoom ${percent}%`);
      announceTransformRef.current = false;
    }
  }

  function changeZoom(ref: ReactZoomPanPinchContentRef, factor: number) {
    announceTransformRef.current = true;
    const nextScale = Math.min(fitScaleRef.current * 8, Math.max(fitScaleRef.current, ref.state.scale * factor));
    void ref.setTransform(ref.state.positionX, ref.state.positionY, nextScale, 180);
  }

  function resetZoom(ref: ReactZoomPanPinchContentRef) {
    announceTransformRef.current = true;
    void ref.setTransform(fitPositionRef.current.x, fitPositionRef.current.y, fitScaleRef.current, 180);
  }

  async function handleImageLoad(ref: ReactZoomPanPinchContentRef) {
    await ref.fitToView({ mode: "contain", minScale: 0.01, maxScale: 1000 });
    fitScaleRef.current = ref.state.scale;
    fitPositionRef.current = { x: ref.state.positionX, y: ref.state.positionY };
    setZoomPercent(100);
  }

  function handleLightboxKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>,
    ref: ReactZoomPanPinchContentRef,
  ) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      changeZoom(ref, 1.25);
    } else if (event.key === "-") {
      event.preventDefault();
      changeZoom(ref, 0.8);
    } else if (event.key === "0") {
      event.preventDefault();
      resetZoom(ref);
    } else if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const deltas = { ArrowUp: [0, 80], ArrowDown: [0, -80], ArrowLeft: [80, 0], ArrowRight: [-80, 0] } as const;
      const [x, y] = deltas[event.key as keyof typeof deltas];
      void ref.panBy(x, y, 120);
    }
  }

  return (
    <section ref={viewerSectionRef} tabIndex={-1} aria-label="Freigegebene Befunde">
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
                  onClick={(event) => {
                    imageTriggerRef.current = event.currentTarget;
                    openImage(finding);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openImage(finding);
                    }
                  }}
                  onFocus={(event) => {
                    imageTriggerRef.current = event.currentTarget;
                  }}
                  tabIndex={0}
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
        <TransformWrapper
          ref={transformRef}
          minScale={0.01}
          maxScale={1000}
          limitToBounds
          centerOnInit
          fitOnInit="contain"
          wheel={{ step: 0.1 }}
          pinch={{ step: 5 }}
          panning={{ disabled: !imageLoaded || zoomPercent <= 100 }}
          doubleClick={{ disabled: true }}
          keyboard={{ disabled: true }}
          onTransform={handleTransform}
          onInit={(ref) => {
            fitScaleRef.current = ref.state.scale;
            fitPositionRef.current = { x: ref.state.positionX, y: ref.state.positionY };
            setZoomPercent(100);
          }}
        >
          {(ref) => (
            <div
              ref={lightboxRef}
              className="lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={`${expandedImage.name} vergrößert`}
              tabIndex={-1}
              onKeyDown={(event) => handleLightboxKeyDown(event, ref)}
            >
              <div className="lightbox__bar">
                <span className="lightbox__title">{expandedImage.name}</span>
                <button ref={closeButtonRef} className="button button--secondary" type="button" onClick={closeImage}>Schließen</button>
              </div>
              <div className={`lightbox__image-wrap${imageLoaded ? "" : " lightbox__image-wrap--loading"}`}>
                {!imageLoaded ? <span role="status">Bild wird geladen...</span> : null}
                <TransformComponent wrapperClass="lightbox__transform-wrapper" contentClass="lightbox__transform-content">
                  <img src={expandedImage.imageUrl} alt={expandedImage.name} className={`lightbox__image${zoomPercent > 100 ? " lightbox__image--zoomed" : ""}`} onLoad={() => { setImageLoaded(true); void handleImageLoad(ref); }} />
                </TransformComponent>
              </div>
              <div className="lightbox__bar lightbox__controls">
                <button className="button button--secondary" type="button" aria-label="Verkleinern" onClick={() => changeZoom(ref, 0.8)} disabled={!imageLoaded}>−</button>
                <span aria-hidden="true">{zoomPercent}%</span>
                <button className="button button--secondary" type="button" aria-label="Vergrößern" onClick={() => changeZoom(ref, 1.25)} disabled={!imageLoaded}>+</button>
                <button className="button button--secondary" type="button" onClick={() => resetZoom(ref)} disabled={!imageLoaded}>Zurücksetzen</button>
                <span className="sr-only" aria-live="polite">{zoomAnnouncement}</span>
              </div>
            </div>
          )}
        </TransformWrapper>
      ) : null}
    </section>
  );
}
