"use client";

const STORAGE_KEY = "instructor-identity-change";
const DEADLINE_KEY = "instructor-deadline-change";

export function browserSessionKey(): string | null {
  return document.cookie.match(/(?:^|;\s*)instructor_identity=([a-f0-9]{64})(?:;|$)/)?.[1] ?? null;
}

// Storage events provide a fallback for browsers without BroadcastChannel;
// keeping the previous key also covers a page still waiting to hydrate.
export function announceSessionChange(previous: string | null) {
  if (!previous) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ previous, nonce: Math.random() })); } catch {}
}

export function announceDeadline(sessionKey: string, deadline: number) {
  try { localStorage.setItem(DEADLINE_KEY, JSON.stringify({ sessionKey, deadline, nonce: Math.random() })); } catch {}
}

export function deadlineFromStorage(event: StorageEvent, sessionKey: string): number | null {
  if (event.key !== DEADLINE_KEY) return null;
  try {
    const value = JSON.parse(event.newValue ?? "null");
    return value?.sessionKey === sessionKey && typeof value.deadline === "number" ? value.deadline : null;
  } catch { return null; }
}

export function wasSessionChanged(sessionKey: string): boolean {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")?.previous === sessionKey; } catch { return false; }
}

export function isSessionChange(event: StorageEvent, sessionKey: string): boolean {
  if (event.key !== STORAGE_KEY) return false;
  try { return JSON.parse(event.newValue ?? "null")?.previous === sessionKey; } catch { return false; }
}
