import { listCaseTypes } from "@/lib/cases";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{ error?: string }>;
};

const pageStyle = {
  fontFamily: "system-ui, sans-serif",
  maxWidth: "32rem",
  margin: "0 auto",
  padding: "2rem",
} as const;

const labelStyle = {
  display: "block",
  marginBottom: "0.25rem",
  fontWeight: 600,
} as const;

const fieldStyle = {
  display: "block",
  width: "100%",
  marginBottom: "1rem",
  padding: "0.5rem",
  fontSize: "1rem",
} as const;

const buttonStyle = {
  padding: "0.6rem 1.2rem",
  fontSize: "1rem",
  cursor: "pointer",
} as const;

export default async function Home({ searchParams }: HomeProps) {
  const { error } = await searchParams;
  const caseTypes = await listCaseTypes();

  return (
    <main style={pageStyle}>
      <h1>Fall starten</h1>
      {error ? (
        <p role="alert" style={{ color: "#b00020" }}>
          {error}
        </p>
      ) : null}
      <form method="post" action="/api/cases">
        <label htmlFor="caseTypeId" style={labelStyle}>
          Falltyp
        </label>
        <select id="caseTypeId" name="caseTypeId" required style={fieldStyle}>
          {caseTypes.map((caseType) => (
            <option key={caseType.id} value={caseType.id}>
              {caseType.name}
            </option>
          ))}
        </select>
        <label htmlFor="name" style={labelStyle}>
          Name des Falls
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="z. B. Gruppe A – Montag"
          style={fieldStyle}
        />
        <button type="submit" style={buttonStyle}>
          Fall starten
        </button>
      </form>
    </main>
  );
}
