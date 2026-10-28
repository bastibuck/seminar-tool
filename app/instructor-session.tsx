"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { announceDeadline, announceSessionChange, browserSessionKey, deadlineFromStorage, isSessionChange, wasSessionChanged } from "./instructor-identity";

const TWO_HOURS = 2 * 60 * 60 * 1000;
const SESSION_EVENT = "instructor-session";
const SessionKeyContext = createContext("");
export type InstructorFetch = (input: string, init?: RequestInit) => Promise<Response>;

// Only mutations initiated by the interface opt into activity. Query refetches
// use this helper too, but never extend the server-side deadline.
export async function instructorFetch(input: string, init: RequestInit | undefined, sessionKey: string): Promise<Response> {
  const action = init?.method && !["GET", "HEAD"].includes(init.method.toUpperCase());
  const started = Date.now();
  const startedMonotonic = performance.now();
  const headers = new Headers(init?.headers);
  headers.set("x-instructor-session", sessionKey);
  if (action) headers.set("x-instructor-activity", "1");
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: { locked: true } }));
  } else if (action && response.headers.get("x-instructor-renewed") === "1") {
    const elapsed = Math.max(0, Date.now() - started, performance.now() - startedMonotonic);
    window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: { deadline: Date.now() + Math.max(0, TWO_HOURS - elapsed) } }));
  }
  return response;
}

export function useInstructorFetch(): InstructorFetch {
  const sessionKey = useContext(SessionKeyContext);
  return useCallback((input, init) => instructorFetch(input, init, sessionKey), [sessionKey]);
}

type SessionProps = {
  children: ReactNode;
  email: string;
  sessionKey: string;
  remainingMs: number;
};

export function InstructorSession({ children, email, sessionKey, remainingMs }: SessionProps) {
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const deadline = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const signingOut = useRef(false);

  useEffect(() => {
    // Measure from the start of navigation, not hydration, so slow page loads
    // cannot add time to the server's deadline.
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    deadline.current = Date.now() - performance.now() + (navigation?.startTime ?? 0) + remainingMs;
    let monotonicDeadline = performance.now() + (deadline.current - Date.now());
    let timer: ReturnType<typeof setTimeout>;
    let isLocked = false;
    let finalLock = false;
    const check = () => {
      clearTimeout(timer);
      const remaining = Math.min(deadline.current - Date.now(), monotonicDeadline - performance.now());
      if (remaining <= 0) {
        isLocked = true;
        setLocked(true);
      } else {
        timer = setTimeout(check, remaining);
      }
    };
    const update = (detail: { deadline?: number; locked?: boolean }, broadcast: boolean) => {
      if (finalLock) return;
      if (detail.locked) {
        isLocked = true;
        finalLock = true;
        setLocked(true);
        clearTimeout(timer);
      } else if (typeof detail.deadline === "number" && detail.deadline > Date.now() && performance.now() + (detail.deadline - Date.now()) > monotonicDeadline) {
        deadline.current = detail.deadline;
        monotonicDeadline = performance.now() + (detail.deadline - Date.now());
        if (isLocked) {
          isLocked = false;
          setLocked(false);
        }
        check();
      }
      if (broadcast) {
        channel.current?.postMessage(detail);
        if (detail.locked) announceSessionChange(sessionKey);
        else if (typeof detail.deadline === "number") announceDeadline(sessionKey, detail.deadline);
      }
    };
    let identityChannel: BroadcastChannel | null = null;
    const identity = browserSessionKey();
    if (identity !== sessionKey || wasSessionChanged(sessionKey)) update({ locked: true }, false);
    else {
      if (typeof BroadcastChannel !== "undefined") {
        channel.current = new BroadcastChannel(`instructor-${sessionKey}`);
        channel.current.onmessage = (event) => update(event.data, false);
        channel.current.postMessage({ deadline: deadline.current });
        identityChannel = new BroadcastChannel("instructor-identity");
        identityChannel.onmessage = (event) => {
          if (event.data?.sessionKey !== sessionKey) update({ locked: true }, true);
        };
        identityChannel.postMessage({ sessionKey });
      }
      announceDeadline(sessionKey, deadline.current);
      setReady(true);
    }
    const onStorage = (event: StorageEvent) => {
      if (isSessionChange(event, sessionKey)) update({ locked: true }, true);
      else {
        const received = deadlineFromStorage(event, sessionKey);
        if (received !== null) update({ deadline: received }, false);
      }
    };
    const onSession = (event: Event) => update((event as CustomEvent).detail, true);
    window.addEventListener(SESSION_EVENT, onSession);
    const onPageShow = () => signingOut.current ? update({ locked: true }, true) : check();
    // Safari does not send Sec-Fetch-User. Mark only actual, trusted link and
    // native form activations; the proxy consumes this on the navigation.
    const markNavigation = () => {
      document.cookie = `instructor_navigation=1; Path=/; Max-Age=5; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
    };
    const onClick = (event: MouseEvent) => {
      if (!event.isTrusted || event.defaultPrevented || (event.button !== 0 && event.button !== 1)) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.origin !== location.origin) return;
      if (link.pathname === "/" || link.pathname === "/admin" || link.pathname.startsWith("/admin/") || link.pathname.startsWith("/cockpit/")) markNavigation();
    };
    const onSubmit = (event: SubmitEvent) => {
      if (!event.isTrusted || event.defaultPrevented) return;
      const form = event.target as HTMLFormElement;
      const action = new URL(form.action, location.href);
      if (action.origin === location.origin && (action.pathname === "/api/cases" || action.pathname.startsWith("/api/admin/"))) markNavigation();
    };
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", check);
    document.addEventListener("click", onClick);
    document.addEventListener("auxclick", onClick);
    document.addEventListener("submit", onSubmit);
    check();
    return () => {
      clearTimeout(timer);
      window.removeEventListener(SESSION_EVENT, onSession);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", check);
      document.removeEventListener("click", onClick);
      document.removeEventListener("auxclick", onClick);
      document.removeEventListener("submit", onSubmit);
      channel.current?.close();
      channel.current = null;
      identityChannel?.close();
    };
  }, [remainingMs, sessionKey]);

  if (locked) {
    return <main className="shell shell--narrow"><h1>Sitzung gesperrt</h1><p>Bitte melde dich erneut an. Nicht gespeicherte Änderungen sind verloren.</p><a className="button" href={`/sign-in?next=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.pathname + window.location.search)}`}>Anmelden</a></main>;
  }

  return <>
    {!ready ? <main className="shell shell--narrow"><p>Sitzung wird geprüft…</p></main> : null}
    <div hidden={!ready}>
    <header className="instructor-bar" aria-label="Anmeldung">
      <span className="instructor-bar__email" aria-label={`Angemeldet als ${email}`}>{email}</span>
      <form action="/api/instructor/sign-out" method="post" onSubmit={() => { signingOut.current = true; announceSessionChange(sessionKey); channel.current?.postMessage({ locked: true }); }}>
        <input type="hidden" name="session" value={sessionKey} />
        <button className="button button--secondary instructor-bar__button" type="submit">Abmelden</button>
      </form>
    </header>
    <SessionKeyContext.Provider value={sessionKey}>{children}</SessionKeyContext.Provider>
    </div>
  </>;
}
