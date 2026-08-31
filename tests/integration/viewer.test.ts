import { describe, expect, it } from "vitest";

import { normalizeCode } from "../../lib/case-code";
import { BASE_URL } from "../setup/server-address";
import {
  createCase,
  extractCaseTypeId,
  extractCode,
  getStartPage,
  toggleFinding,
} from "../support/cases";

async function getCockpit(cockpitUrl: string): Promise<string> {
  const response = await fetch(cockpitUrl);
  expect(response.status).toBe(200);
  return response.text();
}

async function createFreshCase(name: string): Promise<{
  cockpitUrl: string;
  code: string;
}> {
  const caseTypeId = extractCaseTypeId(await getStartPage());
  const response = await createCase({ caseTypeId, name });
  expect(response.status).toBe(303);
  const cockpitUrl = response.headers.get("location")!;
  const code = extractCode(await getCockpit(cockpitUrl));
  return { cockpitUrl, code };
}

function extractFindingsFromCockpit(cockpitHtml: string): { id: string; name: string }[] {
  const findings: { id: string; name: string }[] = [];
  const rowPattern = /<li data-finding-id="([0-9a-f-]{36})">([\s\S]*?)<\/li>/g;
  for (const [, id, content] of cockpitHtml.matchAll(rowPattern)) {
    const name = content.match(/<strong>([^<]*)<\/strong>/)?.[1];
    if (name) findings.push({ id, name });
  }
  return findings;
}

function extractViewerFindings(viewerHtml: string): { name: string; note: string | null }[] {
  const findings: { name: string; note: string | null }[] = [];
  const itemPattern = /<li[^>]*>([\s\S]*?)<\/li>/g;
  for (const [, content] of viewerHtml.matchAll(itemPattern)) {
    const name = content.match(/<strong>([^<]*)<\/strong>/)?.[1];
    if (!name) continue;
    const noteMatch = content.match(/<p>(?!Freigegeben)([^<]+)<\/p>/);
    const note = noteMatch ? noteMatch[1] : null;
    findings.push({ name, note });
  }
  return findings;
}

function hasWaitingMessage(viewerHtml: string): boolean {
  return viewerHtml.includes("Warte auf freigegebene Befunde");
}

describe("viewer join page", () => {
  it("shows a code input form in German", async () => {
    const response = await fetch(`${BASE_URL}/viewer`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Fall beitreten");
    expect(html).toContain("Fallcode");
    expect(html).toContain("Beitreten");
  });

  it("rejects a wrong code with a German error and stays on join page", async () => {
    const response = await fetch(`${BASE_URL}/api/viewer`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: "ZZZZZZZZ" }).toString(),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    const location = response.headers.get("location")!;
    expect(location).toContain("/viewer?error=");
    const errorPage = await fetch(location);
    expect(errorPage.status).toBe(200);
    const html = await errorPage.text();
    expect(html).toContain("Fallcode nicht gefunden");
  });

  it("redirects to the viewer page for a valid code", async () => {
    const { code } = await createFreshCase("Code-Check");

    const response = await fetch(`${BASE_URL}/api/viewer`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code }).toString(),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    const location = response.headers.get("location")!;
    expect(location).toBe(`${BASE_URL}/viewer/${code}`);
  });

  it("accepts an 8-character code typed without the dash", async () => {
    const { code } = await createFreshCase("Ohne Bindestrich");
    expect(normalizeCode(code)).toHaveLength(8);

    const response = await fetch(`${BASE_URL}/api/viewer`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: normalizeCode(code) }).toString(),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    const location = response.headers.get("location")!;
    expect(location).toBe(`${BASE_URL}/viewer/${code}`);
  });
});

describe("viewer feed page", () => {
  it("shows a waiting screen before any release", async () => {
    const { code } = await createFreshCase("Wartebildschirm");
    const pathCode = code;

    const response = await fetch(`${BASE_URL}/viewer/${pathCode}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Wartebildschirm");
    expect(hasWaitingMessage(html)).toBe(true);
  });

  it("shows released findings in chronological order", async () => {
    const { cockpitUrl, code } = await createFreshCase("Reihenfolge Viewer");
    const pathCode = code;
    const cockpitFindings = extractFindingsFromCockpit(
      await getCockpit(cockpitUrl),
    );

    const target = cockpitFindings[2]!;
    await toggleFinding({
      cockpitUrl,
      findingId: target.id,
      intent: "release",
    });

    const response = await fetch(`${BASE_URL}/viewer/${pathCode}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    const viewerFindings = extractViewerFindings(html);
    expect(viewerFindings).toHaveLength(1);
    expect(viewerFindings[0]!.name).toBe(target.name);
  });

  it("catches up a late-joining viewer with all released findings", async () => {
    const { cockpitUrl, code } = await createFreshCase("Nachzügler");
    const pathCode = code;
    const cockpitFindings = extractFindingsFromCockpit(
      await getCockpit(cockpitUrl),
    );

    const released = [cockpitFindings[0]!, cockpitFindings[3]!, cockpitFindings[5]!];
    for (const finding of released) {
      await toggleFinding({
        cockpitUrl,
        findingId: finding.id,
        intent: "release",
      });
    }

    const response = await fetch(`${BASE_URL}/viewer/${pathCode}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    const viewerFindings = extractViewerFindings(html);
    expect(viewerFindings).toHaveLength(3);
    expect(viewerFindings.map((f) => f.name)).toEqual(
      released.map((f) => f.name),
    );
  });

  it("never shows unreleased findings", async () => {
    const { cockpitUrl, code } = await createFreshCase("Unsichtbarkeit");
    const pathCode = code;
    const cockpitFindings = extractFindingsFromCockpit(
      await getCockpit(cockpitUrl),
    );

    await toggleFinding({
      cockpitUrl,
      findingId: cockpitFindings[1]!.id,
      intent: "release",
    });
    await toggleFinding({
      cockpitUrl,
      findingId: cockpitFindings[3]!.id,
      intent: "release",
    });

    const response = await fetch(`${BASE_URL}/viewer/${pathCode}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    const viewerFindings = extractViewerFindings(html);
    expect(viewerFindings).toHaveLength(2);
    expect(viewerFindings.map((f) => f.name)).toEqual([
      cockpitFindings[1]!.name,
      cockpitFindings[3]!.name,
    ]);
  });

  it("returns 404 for an unknown code", async () => {
    const response = await fetch(`${BASE_URL}/viewer/ZZZZZZZZ`);
    expect(response.status).toBe(404);
  });

  it("renders notes passed at release time", async () => {
    const { cockpitUrl, code } = await createFreshCase("Notizen-Test");
    const pathCode = code;
    const cockpitFindings = extractFindingsFromCockpit(
      await getCockpit(cockpitUrl),
    );

    await toggleFinding({
      cockpitUrl,
      findingId: cockpitFindings[0]!.id,
      intent: "release",
      note: "Freitext: Differentialdiagnosen benennen",
    });

    const response = await fetch(`${BASE_URL}/viewer/${pathCode}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    const viewerFindings = extractViewerFindings(html);
    expect(viewerFindings).toHaveLength(1);
    expect(viewerFindings[0]!.name).toBe(cockpitFindings[0]!.name);
    expect(viewerFindings[0]!.note).toBe(
      "Freitext: Differentialdiagnosen benennen",
    );
  });

  it("omits note when releasing without one", async () => {
    const { cockpitUrl, code } = await createFreshCase("Ohne Notiz");
    const pathCode = code;
    const cockpitFindings = extractFindingsFromCockpit(
      await getCockpit(cockpitUrl),
    );

    await toggleFinding({
      cockpitUrl,
      findingId: cockpitFindings[0]!.id,
      intent: "release",
    });

    const response = await fetch(`${BASE_URL}/viewer/${pathCode}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    const viewerFindings = extractViewerFindings(html);
    expect(viewerFindings).toHaveLength(1);
    expect(viewerFindings[0]!.note).toBeNull();
  });

  it("accepts a note submitted as multipart/form-data (dialog form path)", async () => {
    const { cockpitUrl, code } = await createFreshCase("Dialog-Formular");
    const pathCode = code;
    const cockpitFindings = extractFindingsFromCockpit(
      await getCockpit(cockpitUrl),
    );

    const form = new FormData();
    form.set("findingId", cockpitFindings[2]!.id);
    form.set("intent", "release");
    form.set("note", "Multipart-Notiz");

    const release = await fetch(
      `${BASE_URL}/api/cases/${cockpitUrl.split("/").pop()}/releases`,
      {
        method: "POST",
        body: form,
        redirect: "manual",
      },
    );
    expect(release.status).toBe(303);

    const response = await fetch(`${BASE_URL}/viewer/${pathCode}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    const viewerFindings = extractViewerFindings(html);
    expect(viewerFindings).toHaveLength(1);
    expect(viewerFindings[0]!.name).toBe(cockpitFindings[2]!.name);
    expect(viewerFindings[0]!.note).toBe("Multipart-Notiz");
  });
});

describe("viewer JSON API", () => {
  it("returns released findings as JSON in chronological order", async () => {
    const { cockpitUrl, code } = await createFreshCase("JSON Feed");
    const pathCode = code;
    const cockpitFindings = extractFindingsFromCockpit(
      await getCockpit(cockpitUrl),
    );

    await toggleFinding({
      cockpitUrl,
      findingId: cockpitFindings[4]!.id,
      intent: "release",
    });
    await toggleFinding({
      cockpitUrl,
      findingId: cockpitFindings[1]!.id,
      intent: "release",
    });

    const response = await fetch(`${BASE_URL}/api/viewer/${pathCode}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.name).toBe("JSON Feed");
    expect(body.findings).toHaveLength(2);
    expect(body.findings[0]!.name).toBe(cockpitFindings[4]!.name);
    expect(body.findings[1]!.name).toBe(cockpitFindings[1]!.name);
  });

  it("returns 404 for an unknown code", async () => {
    const response = await fetch(`${BASE_URL}/api/viewer/ZZZZZZZZ`);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("hides un-released findings in the JSON feed", async () => {
    const { cockpitUrl, code } = await createFreshCase("JSON Unsichtbar");
    const pathCode = code;
    const cockpitFindings = extractFindingsFromCockpit(
      await getCockpit(cockpitUrl),
    );

    await toggleFinding({
      cockpitUrl,
      findingId: cockpitFindings[0]!.id,
      intent: "release",
    });
    await toggleFinding({
      cockpitUrl,
      findingId: cockpitFindings[2]!.id,
      intent: "release",
    });

    const response = await fetch(`${BASE_URL}/api/viewer/${pathCode}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.findings).toHaveLength(2);
    const names = body.findings.map((f: { name: string }) => f.name);
    expect(names).toContain(cockpitFindings[0]!.name);
    expect(names).toContain(cockpitFindings[2]!.name);
    expect(names).not.toContain(cockpitFindings[1]!.name);
  });
});

describe("viewer independence", () => {
  it("several simultaneous viewer sessions on one case see the same feed", async () => {
    const { cockpitUrl, code } = await createFreshCase("Gleichzeitige Sessions");
    const pathCode = code;
    const cockpitFindings = extractFindingsFromCockpit(
      await getCockpit(cockpitUrl),
    );

    await toggleFinding({
      cockpitUrl,
      findingId: cockpitFindings[0]!.id,
      intent: "release",
    });

    const [res1, res2, res3] = await Promise.all([
      fetch(`${BASE_URL}/viewer/${pathCode}`),
      fetch(`${BASE_URL}/viewer/${pathCode}`),
      fetch(`${BASE_URL}/api/viewer/${pathCode}`),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);

    const html1 = await res1.text();
    const html2 = await res2.text();
    const json3 = await res3.json();

    const findings1 = extractViewerFindings(html1);
    const findings2 = extractViewerFindings(html2);

    expect(findings1).toHaveLength(1);
    expect(findings2).toHaveLength(1);
    expect(findings1[0]!.name).toBe(cockpitFindings[0]!.name);
    expect(findings2[0]!.name).toBe(cockpitFindings[0]!.name);
    expect(json3.findings).toHaveLength(1);
    expect(json3.findings[0]!.name).toBe(cockpitFindings[0]!.name);
  });
});
