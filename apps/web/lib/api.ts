// Server-side access to the AURA API (the NestJS app in apps/api).

export function apiBase(): string {
  return process.env.AURA_API_URL ?? 'http://localhost:4000';
}

/**
 * GET JSON from the API. Returns null when the API is unreachable or errors, so
 * the UI can degrade gracefully instead of crashing the render. `no-store` keeps
 * the Workspace live (uncached, per-request).
 */
export async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${apiBase()}${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
