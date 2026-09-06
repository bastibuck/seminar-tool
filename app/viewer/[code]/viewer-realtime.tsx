"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
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

type ImageSize = {
  width: number;
  height: number;
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

function fitImageToStage(
  stage: HTMLDivElement,
  imageSize: ImageSize,
): ImageSize {
  const styles = getComputedStyle(stage);
  const availableWidth =
    stage.clientWidth -
    Number.parseFloat(styles.paddingLeft) -
    Number.parseFloat(styles.paddingRight);
  const availableHeight =
    stage.clientHeight -
    Number.parseFloat(styles.paddingTop) -
    Number.parseFloat(styles.paddingBottom);
  const scale = Math.min(
    availableWidth / imageSize.width,
    availableHeight / imageSize.height,
  );

  return {
    width: Math.round(imageSize.width * scale),
    height: Math.round(imageSize.height * scale),
  };
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
  const lightboxRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const imageTriggerRef = useRef<HTMLImageElement>(null);
  const transformRef = useRef<ReactZoomPanPinchContentRef | null>(null);
  const imageStageRef = useRef<HTMLDivElement>(null);
  const queryKey = ["viewer", caseCode] as const;
  const [imageNaturalSize, setImageNaturalSize] = useState<ImageSize | null>(
    null,
  );
  const [fittedImageSize, setFittedImageSize] = useState<ImageSize | null>(
    null,
  );

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
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      if (event.key === "Tab") {
        const focusable = lightboxRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled)",
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const focusIsInside = lightboxRef.current?.contains(
          document.activeElement,
        );
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

  useEffect(() => {
    if (!expandedImage || !imageNaturalSize || !imageStageRef.current) return;

    const stage = imageStageRef.current;
    const updateFittedImageSize = () => {
      setFittedImageSize(fitImageToStage(stage, imageNaturalSize));
    };
    const resizeObserver = new ResizeObserver(updateFittedImageSize);

    resizeObserver.observe(stage);
    updateFittedImageSize();
    return () => resizeObserver.disconnect();
  }, [expandedImage, imageNaturalSize]);

  function openImage(finding: ReleasedFinding) {
    setImageNaturalSize(null);
    setFittedImageSize(null);
    setExpandedImage({
      ...finding,
      releasedAt: finding.releasedAt.toISOString(),
    });
  }

  function closeImage() {
    transformRef.current?.resetTransform(0);
    setImageNaturalSize(null);
    setFittedImageSize(null);
    setExpandedImage(null);
    if (imageTriggerRef.current?.isConnected) imageTriggerRef.current.focus();
    else viewerSectionRef.current?.focus();
  }

  return (
    <section
      ref={viewerSectionRef}
      tabIndex={-1}
      aria-label="Freigegebene Befunde"
    >
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
        <div
          ref={lightboxRef}
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${expandedImage.name} vergrößert`}
          tabIndex={-1}
        >
          <div className="lightbox__bar">
            <span className="lightbox__title">{expandedImage.name}</span>
            <button
              ref={closeButtonRef}
              className="button button--secondary"
              type="button"
              onClick={closeImage}
            >
              Schließen
            </button>
          </div>
          <div ref={imageStageRef} className="lightbox__image-wrap">
            {fittedImageSize ? (
              <TransformWrapper
                key={`${fittedImageSize.width}x${fittedImageSize.height}`}
                ref={transformRef}
                initialScale={1}
                minScale={1}
                maxScale={8}
                limitToBounds
                centerZoomedOut
                centerOnInit
                wheel={{ step: 0.1 }}
                pinch={{ step: 5 }}
                panning={{ disabled: false, velocityDisabled: true }}
                doubleClick={{ step: 0.5, mode: "zoomIn", animationTime: 180 }}
                keyboard={{ disabled: true }}
              >
                <TransformComponent
                  wrapperClass="lightbox__transform-wrapper"
                  contentClass="lightbox__transform-content"
                  contentStyle={{
                    position: "relative",
                    width: fittedImageSize.width,
                    height: fittedImageSize.height,
                  }}
                >
                  <img
                    src={expandedImage.imageUrl}
                    alt={expandedImage.name}
                    className="lightbox__image"
                  />
                </TransformComponent>
              </TransformWrapper>
            ) : (
              <img
                src={expandedImage.imageUrl}
                alt=""
                aria-hidden="true"
                className="sr-only"
                onLoad={(event) => {
                  setImageNaturalSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                }}
              />
            )}
          </div>
          <div className="lightbox__bar">
            <span>Zum Vergrößern klicken, dann ziehen</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
