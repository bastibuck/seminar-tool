import {
  CASE_CODE_ALPHABET,
  CASE_CODE_LENGTH,
  formatCaseCode,
} from "@/lib/case-code";

import { CodeInput } from "./code-input";

const inputStyle = { fontSize: "1.5rem", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "DM Mono, monospace" } as const;

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
    <main className="shell shell--narrow">
      <p className="eyebrow">Seminarraum</p>
      <h1>Fall beitreten</h1>
      <p className="lede">Gib den Code ein, den du im Cockpit siehst. Alle freigegebenen Befunde erscheinen hier live.</p>
      {error ? (
        <p role="alert" className="alert">
          {error}
        </p>
      ) : null}
      <form className="surface form-card viewer-join-form" method="post" action="/api/viewer">
        <div className="viewer-join-form__mark" aria-hidden="true">+</div>
        <div className="viewer-join-form__intro">
          <label htmlFor="code">Fallcode eingeben</label>
          <p>Der Code steht im Cockpit der leitenden Person.</p>
        </div>
        <CodeInput
          id="code"
          name="code"
          maxLength={CASE_CODE_LENGTH + 1}
          placeholder={PLACEHOLDER}
          style={inputStyle}
        />
        <button className="button viewer-join-form__submit" type="submit">
          Beitreten
        </button>
      </form>
    </main>
  );
}
