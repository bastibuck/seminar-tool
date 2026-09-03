import { sql } from "./db";

export type AdminFinding = {
  id: string;
  name: string;
  position: number;
};

export async function getCaseTypeDetail(
  id: string,
): Promise<{ name: string; findings: AdminFinding[] } | null> {
  const rows = await sql<{ name: string }[]>`
    select name from case_types where id = ${id}
  `;
  if (rows.length === 0) return null;

  const findings = await sql<AdminFinding[]>`
    select id, name, position from findings
    where case_type_id = ${id} order by position
  `;

  return { name: rows[0]!.name, findings };
}

export type CreateCaseTypeResult =
  | { status: "ok"; id: string }
  | { status: "empty-name" };

export async function createCaseType(
  name: string,
): Promise<CreateCaseTypeResult> {
  const trimmed = name.trim();
  if (trimmed === "") return { status: "empty-name" };
  const rows = await sql<{ id: string }[]>`
    insert into case_types (name) values (${trimmed}) returning id
  `;
  return { status: "ok", id: rows[0]!.id };
}

export type RenameCaseTypeResult =
  | { status: "ok" }
  | { status: "unknown-type" }
  | { status: "empty-name" };

export async function renameCaseType(
  id: string,
  name: string,
): Promise<RenameCaseTypeResult> {
  const trimmed = name.trim();
  if (trimmed === "") return { status: "empty-name" };
  const rows = await sql<{ id: string }[]>`
    update case_types set name = ${trimmed} where id = ${id} returning id
  `;
  if (rows.length === 0) return { status: "unknown-type" };
  return { status: "ok" };
}

export type DeleteCaseTypeResult =
  | { status: "ok" }
  | { status: "unknown-type" }
  | { status: "referenced"; caseName: string };

export async function deleteCaseType(
  id: string,
): Promise<DeleteCaseTypeResult> {
  return sql.begin<DeleteCaseTypeResult>(async (tx) => {
    const referencing = await tx<{ caseName: string }[]>`
      select name as "caseName" from cases where case_type_id = ${id} limit 1
    `;
    if (referencing.length > 0) {
      return { status: "referenced", caseName: referencing[0]!.caseName };
    }
    const rows = await tx<{ id: string }[]>`
      delete from case_types where id = ${id} returning id
    `;
    if (rows.length === 0) return { status: "unknown-type" };
    return { status: "ok" };
  });
}

export type CreateFindingResult =
  | { status: "ok"; id: string }
  | { status: "unknown-type" }
  | { status: "empty-name" }
  | { status: "duplicate-name" };

export async function createFinding(
  caseTypeId: string,
  name: string,
): Promise<CreateFindingResult> {
  const trimmed = name.trim();
  if (trimmed === "") return { status: "empty-name" };
  return sql.begin<CreateFindingResult>(async (tx) => {
    const typeCheck = await tx<{ id: string }[]>`
      select id from case_types where id = ${caseTypeId}
    `;
    if (typeCheck.length === 0) return { status: "unknown-type" };

    const existing = await tx<{ id: string }[]>`
      select id from findings
      where case_type_id = ${caseTypeId} and name = ${trimmed}
    `;
    if (existing.length > 0) return { status: "duplicate-name" };

    const maxPos = await tx<{ maxPos: number | null }[]>`
      select max(position) as "maxPos" from findings
      where case_type_id = ${caseTypeId}
    `;
    const nextPosition = (maxPos[0]?.maxPos ?? 0) + 1;

    const rows = await tx<{ id: string }[]>`
      insert into findings (case_type_id, name, position)
      values (${caseTypeId}, ${trimmed}, ${nextPosition})
      returning id
    `;
    return { status: "ok", id: rows[0]!.id };
  });
}

export type RenameFindingResult =
  | { status: "ok" }
  | { status: "unknown-finding" }
  | { status: "empty-name" }
  | { status: "duplicate-name" };

export async function renameFinding(
  findingId: string,
  name: string,
): Promise<RenameFindingResult> {
  const trimmed = name.trim();
  if (trimmed === "") return { status: "empty-name" };
  return sql.begin<RenameFindingResult>(async (tx) => {
    const existing = await tx<{ id: string; caseTypeId: string }[]>`
      select id, case_type_id as "caseTypeId" from findings where id = ${findingId}
    `;
    if (existing.length === 0) return { status: "unknown-finding" };

    const duplicate = await tx<{ id: string }[]>`
      select id from findings
      where case_type_id = ${existing[0]!.caseTypeId}
        and name = ${trimmed} and id != ${findingId}
    `;
    if (duplicate.length > 0) return { status: "duplicate-name" };

    await tx`update findings set name = ${trimmed} where id = ${findingId}`;
    return { status: "ok" };
  });
}

export type DeleteFindingResult =
  | { status: "ok" }
  | { status: "unknown-finding" }
  | { status: "referenced"; caseName: string };

export async function deleteFinding(
  findingId: string,
): Promise<DeleteFindingResult> {
  return sql.begin<DeleteFindingResult>(async (tx) => {
    const existing = await tx<{ id: string; caseTypeId: string; position: number }[]>`
      select id, case_type_id as "caseTypeId", position
      from findings where id = ${findingId}
    `;
    if (existing.length === 0) return { status: "unknown-finding" };

    const { caseTypeId, position } = existing[0]!;

    const released = await tx<{ caseName: string }[]>`
      select c.name as "caseName"
      from releases r
      join cases c on c.id = r.case_id
      where r.finding_id = ${findingId}
      limit 1
    `;
    if (released.length > 0) {
      return { status: "referenced", caseName: released[0]!.caseName };
    }

    await tx`delete from findings where id = ${findingId}`;

    const remaining = await tx<{ id: string }[]>`
      select id from findings
      where case_type_id = ${caseTypeId} and position > ${position}
      order by position
    `;
    for (let i = 0; i < remaining.length; i++) {
      await tx`update findings set position = ${position + i} where id = ${remaining[i]!.id}`;
    }

    return { status: "ok" };
  });
}

export type SwapFindingsResult =
  | { status: "ok" }
  | { status: "unknown-type" }
  | { status: "invalid-swap" };

export async function swapFindings(
  caseTypeId: string,
  findingIdA: string,
  findingIdB: string,
): Promise<SwapFindingsResult> {
  return sql.begin<SwapFindingsResult>(async (tx) => {
    const rows = await tx<{ id: string; position: number }[]>`
      select id, position from findings
      where case_type_id = ${caseTypeId}
        and id in (${findingIdA}, ${findingIdB})
      order by position
    `;
    if (rows.length !== 2) return { status: "invalid-swap" };

    const a = rows[0]!;
    const b = rows[1]!;
    if (Math.abs(a.position - b.position) !== 1) return { status: "invalid-swap" };

    const pivot = -a.position;
    await tx`update findings set position = ${pivot} where id = ${a.id}`;
    await tx`update findings set position = ${a.position} where id = ${b.id}`;
    await tx`update findings set position = ${b.position} where id = ${a.id}`;

    return { status: "ok" };
  });
}
