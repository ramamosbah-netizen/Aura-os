// Server-side access to the AURA API (the NestJS app in apps/api). Runs only in Server
// Components and route handlers — it reads the httpOnly session cookie to forward identity.
import { cookies } from 'next/headers';
import { SESSION_COOKIE, type SessionUser, decodeSessionUser } from './session';

export function apiBase(): string {
  return process.env.AURA_API_URL ?? 'http://localhost:4000';
}

const DEFAULT_API_TIMEOUT_MS = 30_000;

/**
 * Fetch an upstream service with a bounded wait.
 *
 * Every BFF route uses this seam so a stalled API cannot leave a browser mutation or server
 * render waiting indefinitely. A caller-supplied abort signal is preserved and combined with the
 * deadline. `AURA_API_TIMEOUT_MS` is intentionally clamped: a typo must not disable the bound.
 */
export async function apiFetch(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] = {},
  timeoutMs = configuredApiTimeoutMs(),
): Promise<Response> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  return fetch(input, { ...init, signal });
}

function configuredApiTimeoutMs(): number {
  const configured = Number(process.env.AURA_API_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_API_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(configured), 1_000), 120_000);
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

/**
 * Forward the client's replay-safety headers to the API.
 *
 * The offline engine replays a queued mutation under the same `Idempotency-Key` every time, and
 * the API's global idempotency interceptor is the only thing that turns that into "runs at most
 * once". A BFF route that builds its outbound header set from scratch drops the key, and the
 * guarantee silently stops at the proxy: the API sees two unrelated creates and writes two rows.
 * Any route that a queued write can reach has to pass these through.
 */
export function replayHeaders(request: Request): Record<string, string> {
  const forwarded: Record<string, string> = {};
  for (const name of ['idempotency-key', 'x-operation-id', 'x-client-entity-id']) {
    const value = request.headers.get(name);
    if (value) forwarded[name] = value;
  }
  return forwarded;
}

/** The signed-in user (decoded for display only — the API verifies), or null. */
export async function currentUser(): Promise<SessionUser | null> {
  return decodeSessionUser(await sessionToken());
}

/**
 * Why a read produced no data. `getJson` collapses all of these into `null`, which is why a
 * failed request, a refused one and a genuinely empty table were indistinguishable on screen —
 * audit gap G-05. For an ERP where "is this list actually empty?" is a financially material
 * question, that is the difference between "you have no unpaid invoices" and "we could not tell
 * you about your unpaid invoices".
 */
// The load-failure taxonomy now lives in the client-safe `./data-error` module (it must not
// pull `next/headers` into client bundles). Re-exported here so every existing `@/lib/api`
// import keeps resolving unchanged.
export type { DataErrorKind, DataError, DataResult } from './data-error';
export { classifyStatus, describeDataError } from './data-error';
import type { DataResult } from './data-error';
import { classifyStatus } from './data-error';

/** Callers pass `/api/...`; the versioned Nest API lives at `/api/v1/...`. */
function versioned(path: string): string {
  return path.startsWith('/api/') && !path.startsWith('/api/v1/') ? path.replace('/api/', '/api/v1/') : path;
}

/**
 * GET JSON from the API, keeping WHY a read failed.
 *
 * Prefer this over `getJson` for anything a user reads as a factual statement about their data.
 * `no-store` keeps the Workspace live (uncached, per-request).
 */
export async function fetchJson<T>(path: string): Promise<DataResult<T>> {
  try {
    const res = await apiFetch(`${apiBase()}${versioned(path)}`, { cache: 'no-store', headers: await authHeader() });
    if (!res.ok) return { ok: false, error: { kind: classifyStatus(res.status), status: res.status } };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    // Never reached the API at all — DNS, connection refused, timeout, malformed JSON.
    return { ok: false, error: { kind: 'unreachable', status: 0 } };
  }
}

/**
 * GET JSON, or null on any failure.
 *
 * Retained deliberately: 450+ call sites depend on this shape, and for surfaces where an empty
 * render is genuinely harmless (badges, counts, secondary panels) it is still the right tool.
 * Where the answer is load-bearing, use `fetchJson` and show the user which case they are in.
 */
export async function getJson<T>(path: string): Promise<T | null> {
  const result = await fetchJson<T>(path);
  return result.ok ? result.data : null;
}
