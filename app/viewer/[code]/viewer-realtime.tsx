"use client";

import { useCallback, useEffect, useState } from "react";

import type { ReleasedFinding } from "@/lib/cases";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type FindingView = {
  id: string;
  name: string;
  note: string | null;
  releasedAt: string;
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

export function ViewerRealtime({
  caseId,
  caseCode,
  initialFindings,
  initialEnded,
}: ViewerRealtimeProps) {
  const [findings, setFindings] = useState<ReleasedFinding[]>(initialFindings);
  const [ended, setEnded] = useState(initialEnded);

  const fetchFindings = useCallback(async () => {
    try {
      const response = await fetch(`/api/viewer/${caseCode}`);
      if (!response.ok) return;
      const data = await response.json();
      setFindings(
        data.findings.map((f: FindingView) => ({
          id: f.id,
          name: f.name,
          note: f.note,
          releasedAt: new Date(f.releasedAt),
        })),
      );
      if (typeof data.ended === "boolean") setEnded(data.ended);
    } catch {
      // silently ignore fetch errors
    }
  }, [caseCode]);

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
          fetchFindings();
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
          fetchFindings();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [caseId, fetchFindings]);

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
    </section>
  );
}
