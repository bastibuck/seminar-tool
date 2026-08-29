import { generateCaseCode } from "./case-code";
import { sql } from "./db";

export type CaseType = {
  id: string;
  name: string;
};

export type Finding = {
  id: string;
  name: string;
  note: string | null;
  releasedAt: Date | null;
};

export type CaseOverview = {
  name: string;
  code: string;
  endedAt: Date | null;
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

export async function caseTypeExists(id: string): Promise<boolean> {
  if (id === "") return false;
  const rows = await sql<{ id: string }[]>`
    select id
    from case_types
    where id = ${id}
  `;
  return rows.length > 0;
}

const CASE_CODE_CONSTRAINT = "cases_code_key";

function isCodeCollision(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505" &&
    "constraint" in error &&
    (error as { constraint?: unknown }).constraint === CASE_CODE_CONSTRAINT
  );
}

export async function createCase(input: {
  name: string;
  caseTypeId: string;
}): Promise<string> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateCaseCode();
    try {
      const rows = await sql<{ cockpit_id: string }[]>`
        insert into cases (case_type_id, name, code)
        values (${input.caseTypeId}, ${input.name}, ${code})
        returning cockpit_id
      `;
      return rows[0]!.cockpit_id;
    } catch (error) {
      if (!isCodeCollision(error)) throw error;
    }
  }
  throw new Error("Konnte keinen eindeutigen Fallcode erzeugen");
}

type CaseRow = {
  id: string;
  caseTypeId: string;
  name: string;
  code: string;
  endedAt: Date | null;
};

async function getCaseByCockpitId(
  cockpitId: string,
): Promise<CaseRow | undefined> {
  const [row] = await sql<
    {
      id: string;
      caseTypeId: string;
      name: string;
      code: string;
      endedAt: Date | null;
    }[]
  >`
    select id,
           case_type_id as "caseTypeId",
           name,
           code,
           ended_at as "endedAt"
    from cases
    where cockpit_id = ${cockpitId}
  `;
  return row;
}

export async function getCaseOverview(
  cockpitId: string,
): Promise<CaseOverview | null> {
  const row = await getCaseByCockpitId(cockpitId);
  if (!row) return null;

  const findings = await sql<Finding[]>`
    select f.id, f.name, f.note, r.released_at as "releasedAt"
    from findings f
    left join releases r
      on r.finding_id = f.id and r.case_id = ${row.id}
    where f.case_type_id = ${row.caseTypeId}
    order by f.position
  `;

  return {
    name: row.name,
    code: row.code,
    endedAt: row.endedAt,
    findings,
  };
}

export type ReleasedFinding = {
  id: string;
  name: string;
  note: string | null;
  releasedAt: Date;
};

export type ViewerCase = {
  caseId: string;
  name: string;
  endedAt: Date | null;
  findings: ReleasedFinding[];
};

export async function getCaseByCode(
  code: string,
): Promise<ViewerCase | null> {
  const rows = await sql<{ id: string; name: string; endedAt: Date | null }[]>`
    select id, name, ended_at as "endedAt"
    from cases
    where code = ${code}
  `;
  const row = rows[0];
  if (!row) return null;

  const findings = await sql<ReleasedFinding[]>`
    select f.id, f.name, f.note, r.released_at as "releasedAt"
    from findings f
    join releases r on r.finding_id = f.id and r.case_id = ${row.id}
    where f.case_type_id = (
      select case_type_id from cases where id = ${row.id}
    )
    order by r.released_at
  `;

  return {
    caseId: row.id,
    name: row.name,
    endedAt: row.endedAt,
    findings,
  };
}

export type ReleaseIntent = "release" | "unrelease";

export type ReleaseResult = "ok" | "ended" | "unknown-case" | "unknown-finding";

export async function setFindingReleased(input: {
  cockpitId: string;
  findingId: string;
  intent: ReleaseIntent;
}): Promise<ReleaseResult> {
  const row = await getCaseByCockpitId(input.cockpitId);
  if (!row) return "unknown-case";
  if (row.endedAt) return "ended";

  const [finding] = await sql<{ id: string }[]>`
    select id
    from findings
    where id = ${input.findingId} and case_type_id = ${row.caseTypeId}
  `;
  if (!finding) return "unknown-finding";

  if (input.intent === "release") {
    await sql`
      insert into releases (case_id, finding_id)
      values (${row.id}, ${finding.id})
      on conflict (case_id, finding_id) do nothing
    `;
  } else {
    await sql`
      delete from releases
      where case_id = ${row.id} and finding_id = ${finding.id}
    `;
  }

  return "ok";
}

export type EndResult = "ok" | "unknown-case";

export async function endCase(cockpitId: string): Promise<EndResult> {
  const rows = await sql<{ id: string }[]>`
    update cases
    set ended_at = coalesce(ended_at, now())
    where cockpit_id = ${cockpitId}
    returning id
  `;
  if (rows.length === 0) return "unknown-case";
  return "ok";
}
