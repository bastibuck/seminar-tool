"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

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

const feedItemStyle = {
  marginBottom: "1.5rem",
  padding: "1rem",
  border: "1px solid #d0d7de",
  borderRadius: "6px",
} as const;

const waitingStyle = {
  color: "#57606a",
  fontSize: "1.1rem",
  marginTop: "2rem",
} as const;

const bannerStyle = {
  marginBottom: "1.5rem",
  padding: "0.5rem 1rem",
  border: "1px solid #d0d7de",
  borderRadius: "6px",
  backgroundColor: "#f6f8fa",
  color: "#57606a",
} as const;

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

  return (
    <section aria-label="Freigegebene Befunde">
      {ended ? <p style={bannerStyle}>Fall beendet</p> : null}
      {findings.length === 0 ? (
        <p style={waitingStyle}>Warte auf freigegebene Befunde…</p>
      ) : (
        <>
          <h2>Befunde</h2>
          <ol style={{ listStyle: "none", padding: 0 }}>
            {findings.map((finding) => (
              <li key={finding.id} style={feedItemStyle}>
                <strong>{finding.name}</strong>
                <img
                  src={finding.imageUrl}
                  alt={finding.name}
                  style={{ display: "block", maxWidth: "100%", maxHeight: "18rem", objectFit: "contain", cursor: "zoom-in", marginTop: "0.75rem" }}
                  onClick={() => setExpandedImage({ ...finding, releasedAt: finding.releasedAt.toISOString() })}
                />
                {finding.note ? <p>{finding.note}</p> : null}
                <p style={{ color: "#57606a", fontSize: "0.85rem" }}>
                  Freigegeben um{" "}
                  <time dateTime={finding.releasedAt.toISOString()}>
                    {timeFormat.format(finding.releasedAt)}
                  </time>{" "}
                  Uhr
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
      {expandedImage ? (
        <div
          role="dialog"
          aria-label={expandedImage.name}
          onClick={() => setExpandedImage(null)}
          onKeyDown={(event) => event.key === "Escape" && setExpandedImage(null)}
          tabIndex={0}
          style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", padding: "2rem", background: "rgb(0 0 0 / 75%)", cursor: "zoom-out" }}
        >
          <img src={expandedImage.imageUrl} alt={expandedImage.name} style={{ maxWidth: "100%", maxHeight: "100%" }} />
        </div>
      ) : null}
    </section>
  );
}
