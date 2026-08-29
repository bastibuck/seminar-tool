import { notFound, redirect } from "next/navigation";

import { getCaseOverview } from "@/lib/cases";

export const dynamic = "force-dynamic";

type EndConfirmationPageProps = {
  params: Promise<{ id: string }>;
};

const COCKPIT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pageStyle = {
  fontFamily: "system-ui, sans-serif",
  maxWidth: "40rem",
  margin: "0 auto",
  padding: "2rem",
} as const;

const warningStyle = {
  padding: "1rem",
  border: "1px solid #d0d7de",
  borderRadius: "6px",
  margin: "1rem 0",
} as const;

const buttonStyle = {
  padding: "0.6rem 1.2rem",
  fontSize: "1rem",
  cursor: "pointer",
} as const;

const cancelStyle = {
  display: "inline-block",
  marginLeft: "1rem",
  padding: "0.6rem 1.2rem",
  fontSize: "1rem",
} as const;

export default async function EndConfirmationPage({
  params,
}: EndConfirmationPageProps) {
  const { id } = await params;

  if (!COCKPIT_ID_PATTERN.test(id)) notFound();

  const overview = await getCaseOverview(id);
  if (!overview) notFound();
  if (overview.endedAt) redirect(`/cockpit/${id}`);

  return (
    <main style={pageStyle}>
      <p>Cockpit</p>
      <h1>Fall beenden</h1>
      <p>
        Möchtest du den Fall <strong>{overview.name}</strong> jetzt beenden?
      </p>
      <div role="note" style={warningStyle}>
        Das Beenden ist endgültig und kann nicht rückgängig gemacht werden.
        Danach können keine Befunde mehr freigegeben oder zurückgezogen werden.
        Die bereits freigegebenen Befunde bleiben für die Studierenden sichtbar.
      </div>
      <form method="post" action={`/api/cases/${id}/end`}>
        <button type="submit" style={buttonStyle}>
          Fall jetzt beenden
        </button>
      </form>
      <a href={`/cockpit/${id}`} style={cancelStyle}>
        Zurück zum Cockpit
      </a>
    </main>
  );
}