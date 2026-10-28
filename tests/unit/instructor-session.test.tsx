// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstructorSession, instructorFetch, useInstructorFetch } from "../../app/instructor-session";
import { SignInForm } from "../../app/sign-in/sign-in-form";
import { announceSessionChange, wasSessionChanged } from "../../app/instructor-identity";

const SESSION = "a".repeat(64);
const OTHER_SESSION = "b".repeat(64);

class TestChannel {
  static channels = new Set<TestChannel>();
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(private name: string) { TestChannel.channels.add(this); }
  postMessage(data: unknown) {
    for (const other of TestChannel.channels) {
      if (other !== this && other.name === this.name) other.onmessage?.({ data } as MessageEvent);
    }
  }
  close() { TestChannel.channels.delete(this); }
}

describe("open Instructor pages", () => {
  const roots: Root[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    const started = Date.now();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("BroadcastChannel", TestChannel);
    vi.stubGlobal("performance", { now: () => Date.now() - started, getEntriesByType: () => [] });
  });
  afterEach(() => {
    act(() => roots.splice(0).forEach((root) => root.unmount()));
    document.body.innerHTML = "";
    localStorage.clear();
    document.cookie = "instructor_identity=; Max-Age=0; Path=/";
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function page(sessionKey = SESSION, identity = sessionKey) {
    document.cookie = `instructor_identity=${identity}; Path=/`;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<InstructorSession email="teacher@example.test" sessionKey={sessionKey} remainingMs={7_200_000}><label>Draft<input defaultValue="private draft" /></label></InstructorSession>));
    return container;
  }

  it("locks at the deadline even when someone types, without sending a heartbeat", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const container = page();
    act(() => { vi.advanceTimersByTime(7_199_000); });
    const input = container.querySelector<HTMLInputElement>("input:not([type=hidden])")!;
    input.value = "still typing";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(container.textContent).toContain("teacher@example.test");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(container.textContent).toContain("Sitzung gesperrt");
    expect(container.querySelector("input:not([type=hidden])")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("href")).toContain("/sign-in?next=");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("binds mount-time requests to the rendered session", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    function InitialQuery() {
      const request = useInstructorFetch();
      useEffect(() => { void request("/api/admin/case-types"); }, [request]);
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    document.cookie = `instructor_identity=${SESSION}; Path=/`;
    await act(async () => root.render(<InstructorSession email="teacher@example.test" sessionKey={SESSION} remainingMs={7_200_000}><InitialQuery /></InstructorSession>));
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![1].headers.get("x-instructor-session")).toBe(SESSION);
  });

  it("shows the Instructor identity and sign-out together", () => {
    const container = page();
    const header = container.querySelector("header[aria-label='Anmeldung']")!;
    expect(header.textContent).toContain("teacher@example.test");
    expect(header.querySelector("button")?.textContent).toBe("Abmelden");
    expect(header.querySelector("form")?.getAttribute("action")).toBe("/api/instructor/sign-out");
  });

  it("extends the timer for successful user actions but not background reads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200, headers: { "x-instructor-renewed": "1" } })));
    const container = page();
    act(() => { vi.advanceTimersByTime(3_600_000); });
    await act(async () => { await instructorFetch("/api/admin/case-types", undefined, SESSION); });
    act(() => { vi.advanceTimersByTime(3_599_000); });
    expect(container.textContent).not.toContain("Sitzung gesperrt");
    await act(async () => { await instructorFetch("/api/admin/case-types", { method: "POST" }, SESSION); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(container.textContent).not.toContain("Sitzung gesperrt");
    act(() => { vi.advanceTimersByTime(7_199_000); });
    expect(container.textContent).toContain("Sitzung gesperrt");
  });

  it("locks other tabs of the signed-out session, but not a different browser session", () => {
    const first = page();
    const otherTab = page();
    const form = first.querySelector("form")!;
    expect(form.getAttribute("action")).toBe("/api/instructor/sign-out");
    form.addEventListener("submit", (event) => event.preventDefault());
    act(() => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(otherTab.textContent).toContain("Sitzung gesperrt");
    act(() => { window.dispatchEvent(new Event("pageshow")); });
    expect(first.textContent).toContain("Sitzung gesperrt");
  });

  it("locks an old page when a different session signs in in the same browser", () => {
    const first = page();
    const replacement = page(OTHER_SESSION);
    expect(first.textContent).toContain("Sitzung gesperrt");
    expect(replacement.textContent).not.toContain("Sitzung gesperrt");
  });

  it("locks a page hydrated after the browser session has changed", () => {
    const active = page(OTHER_SESSION);
    const stale = page(SESSION, OTHER_SESSION);
    expect(stale.textContent).toContain("Sitzung gesperrt");
    expect(active.textContent).not.toContain("Sitzung gesperrt");
  });

  it("locks a page hydrated after sign-out removed its identity cookie", () => {
    const stale = page(SESSION, "");
    expect(stale.textContent).toContain("Sitzung gesperrt");
  });

  it("locks other tabs on a storage notification without BroadcastChannel", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const key = SESSION;
    const container = page(key);
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: "instructor-identity-change", newValue: JSON.stringify({ previous: key }) })); });
    expect(container.textContent).toContain("Sitzung gesperrt");
  });

  it("writes a handover notification without crypto.randomUUID", () => {
    vi.stubGlobal("crypto", {});
    announceSessionChange(SESSION);
    expect(wasSessionChanged(SESSION)).toBe(true);
  });

  it("shares a renewed deadline via storage without BroadcastChannel", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const container = page();
    act(() => { vi.advanceTimersByTime(3_600_000); });
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: "instructor-deadline-change", newValue: JSON.stringify({ sessionKey: SESSION, deadline: Date.now() + 7_200_000 }) })); });
    act(() => { vi.advanceTimersByTime(3_600_000); });
    expect(container.textContent).not.toContain("Sitzung gesperrt");
    act(() => { vi.advanceTimersByTime(3_600_000); });
    expect(container.textContent).toContain("Sitzung gesperrt");
  });

  it("locks at the deadline even if the device clock moves backward", () => {
    let monotonicTime = 0;
    vi.stubGlobal("performance", { now: () => monotonicTime, getEntriesByType: () => [] });
    const container = page();
    vi.setSystemTime(Date.now() - 10 * 60 * 60 * 1000);
    monotonicTime = 7_200_000;
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(container.textContent).toContain("Sitzung gesperrt");
  });

  it("accepts a renewal after the device clock moves backward", async () => {
    let monotonicTime = 0;
    vi.stubGlobal("performance", { now: () => monotonicTime, getEntriesByType: () => [] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200, headers: { "x-instructor-renewed": "1" } })));
    const container = page();
    monotonicTime = 3_600_000;
    vi.setSystemTime(Date.now() - 10 * 60 * 60 * 1000);
    await act(async () => { await instructorFetch("/api/admin/case-types", { method: "POST" }, SESSION); });
    monotonicTime = 7_200_000;
    vi.setSystemTime(Date.now() + 3_600_000);
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(container.textContent).not.toContain("Sitzung gesperrt");
  });

  it("does not extend the deadline if the clock moves backward during an action", async () => {
    let monotonicTime = 0;
    let respond!: (response: Response) => void;
    vi.stubGlobal("performance", { now: () => monotonicTime, getEntriesByType: () => [] });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((resolve) => { respond = resolve; })));
    const container = page();
    let pending!: Promise<Response>;
    act(() => { pending = instructorFetch("/api/admin/case-types", { method: "POST" }, SESSION); });
    vi.setSystemTime(Date.now() - 10 * 60 * 60 * 1000);
    monotonicTime = 500;
    await act(async () => { respond(new Response(null, { status: 200, headers: { "x-instructor-renewed": "1" } })); await pending; });
    monotonicTime = 7_200_000;
    vi.setSystemTime(Date.now() + 7_199_500);
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(container.textContent).toContain("Sitzung gesperrt");
  });

  it("locks old pages before a sign-in attempt can replace the shared cookie", () => {
    const first = page();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<SignInForm next="/admin" />));
    const form = container.querySelector("form")!;
    form.addEventListener("submit", (event) => event.preventDefault());
    act(() => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(first.textContent).toContain("Sitzung gesperrt");
  });

  it("locks immediately on an unauthorized protected response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const container = page();
    await act(async () => { await instructorFetch("/api/admin/case-types", { method: "POST" }, SESSION); });
    expect(container.textContent).toContain("Sitzung gesperrt");
  });

  it("keeps the page open when a rejected user action reached the server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 409, headers: { "x-instructor-renewed": "1" } })));
    const container = page();
    act(() => { vi.advanceTimersByTime(7_199_000); });
    await act(async () => { await instructorFetch("/api/admin/case-types", { method: "POST" }, SESSION); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(container.textContent).not.toContain("Sitzung gesperrt");
  });

  it("does not extend the timer for an infrastructure error before authentication", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 413 })));
    const container = page();
    act(() => { vi.advanceTimersByTime(7_199_000); });
    await act(async () => { await instructorFetch("/api/admin/case-types", { method: "POST" }, SESSION); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(container.textContent).toContain("Sitzung gesperrt");
  });

  it("restores a page if an in-flight action renewed the session before the old deadline", async () => {
    let respond!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((resolve) => { respond = resolve; })));
    const container = page();
    act(() => { vi.advanceTimersByTime(7_199_000); });
    let pending!: Promise<Response>;
    act(() => { pending = instructorFetch("/api/admin/case-types", { method: "POST" }, SESSION); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(container.textContent).toContain("Sitzung gesperrt");
    await act(async () => { respond(new Response(null, { status: 200, headers: { "x-instructor-renewed": "1" } })); await pending; });
    expect(container.textContent).not.toContain("Sitzung gesperrt");
  });
});
