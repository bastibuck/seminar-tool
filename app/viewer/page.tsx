import {
  CASE_CODE_ALPHABET,
  CASE_CODE_LENGTH,
  formatCaseCode,
} from "@/lib/case-code";

import { CodeInput } from "./code-input";

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

const inputStyle = {
  display: "block",
  width: "100%",
  marginBottom: "1rem",
  padding: "0.5rem",
  fontSize: "1.5rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  fontFamily: "monospace",
} as const;

const buttonStyle = {
  padding: "0.6rem 1.2rem",
  fontSize: "1rem",
  cursor: "pointer",
} as const;

const PLACEHOLDER = formatCaseCode(
  CASE_CODE_ALPHABET.slice(0, CASE_CODE_LENGTH),
);

type ViewerJoinProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ViewerJoinPage({
  searchParams,
}: ViewerJoinProps) {
  const { error } = await searchParams;

  return (
    <main style={pageStyle}>
      <h1>Fall beitreten</h1>
      {error ? (
        <p role="alert" style={{ color: "#b00020" }}>
          {error}
        </p>
      ) : null}
      <form method="post" action="/api/viewer">
        <label htmlFor="code" style={labelStyle}>
          Fallcode
        </label>
        <CodeInput
          id="code"
          name="code"
          maxLength={CASE_CODE_LENGTH + 1}
          placeholder={PLACEHOLDER}
          style={inputStyle}
        />
        <button type="submit" style={buttonStyle}>
          Beitreten
        </button>
      </form>
    </main>
  );
}
