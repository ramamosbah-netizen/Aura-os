// Server-side access to the AURA API (the NestJS app in apps/api). Runs only in Server
// Components and route handlers — it reads the httpOnly session cookie to forward identity.
import { cookies } from 'next/headers';
import { SESSION_COOKIE, type SessionUser, decodeSessionUser } from './session';

export function apiBase(): string {
  return process.env.AURA_API_URL ?? 'http://localhost:4000';
}

/** The current session token from the httpOnly cookie, or null. */
export async function sessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** Authorization header to forward to the API (empty when signed out). */
export async function authHeader(): Promise<Record<string, string>> {
  const token = await sessionToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** The signed-in user (decoded for display only — the API verifies), or null. */
export async function currentUser(): Promise<SessionUser | null> {
  return decodeSessionUser(await sessionToken());
}

/**
 * GET JSON from the API. Returns null when the API is unreachable or errors, so
 * the UI can degrade gracefully instead of crashing the render. `no-store` keeps
 * the Workspace live (uncached, per-request).
 */
export async function getJson<T>(path: string): Promise<T | null> {
  // getJson always targets the versioned Nest API. Callers pass `/api/...`; normalize to
  // `/api/v1/...` here so every Server-Component fetch is versioned without touching call sites.
  const p = path.startsWith('/api/') && !path.startsWith('/api/v1/') ? path.replace('/api/', '/api/v1/') : path;
  try {
    const res = await fetch(`${apiBase()}${p}`, { cache: 'no-store', headers: await authHeader() });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
