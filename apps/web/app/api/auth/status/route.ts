import { apiBase } from '@/lib/api';

// Is the API asking for credentials? Reports whether a JWT verifier is configured, so the browser
// side can tell "auth is off in this environment" apart from "you are signed out" — the E2E global
// setup needs exactly that distinction to decide whether to sign in.
// Deliberately unauthenticated: it exposes a boolean about configuration, never about a session.
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/auth/status`, { cache: 'no-store' });
    const data = (await res.json().catch(() => ({}))) as { enabled?: boolean };
    return Response.json({ enabled: data.enabled ?? false }, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({ error: 'auth service unreachable' }, { status: 502 });
  }
}
