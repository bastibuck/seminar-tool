import { sql } from "./db";

import { generateShortCode } from "./short-code";

export type CaseType = {
  id: string;
  name: string;
};

export type Finding = {
  id: string;
  name: string;
  note: string | null;
};

export type CaseOverview = {
  name: string;
  code: string;
  findings: Finding[];
};

const MAX_CODE_ATTEMPTS = 5;

export async function listCaseTypes(): Promise<CaseType[]> {
  return sql<CaseType[]>`
    select id, name
    from case_types
    order by name
  `;
}

async function caseTypeExists(id: string): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    select id
    from case_types
    where id = ${id}
  `;
  return rows.length > 0;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export async function createCase(input: {
  name: string;
  caseTypeId: string;
}): Promise<string> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateShortCode();
    try {
      const rows = await sql<{ cockpit_id: string }[]>`
        insert into cases (case_type_id, name, code)
        values (${input.caseTypeId}, ${input.name}, ${code})
        returning cockpit_id
      `;
      return rows[0]!.cockpit_id;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error("Konnte keinen eindeutigen Fallcode erzeugen");
}

export async function validateCaseType(
  caseTypeId: string,
): Promise<boolean> {
  if (caseTypeId === "") return false;
  return caseTypeExists(caseTypeId);
}

export async function getCaseOverview(
  cockpitId: string,
): Promise<CaseOverview | null> {
  const [row] = await sql<
    { caseTypeId: string; name: string; code: string }[]
  >`
    select case_type_id as "caseTypeId", name, code
    from cases
    where cockpit_id = ${cockpitId}
  `;

  if (!row) return null;

  const findings = await sql<Finding[]>`
    select id, name, note
    from findings
    where case_type_id = ${row.caseTypeId}
    order by position
  `;

  return { name: row.name, code: row.code, findings };
}
