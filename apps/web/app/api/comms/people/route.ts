import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: the authenticated caller's same-company directory for starting private chats.
// Company filtering is authoritative in the API; this route only forwards the session.
export async function GET(): Promise<Response> {
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/comms/people`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch {
    return Response.json({ error: 'Comms API unreachable' }, { status: 502 });
  }
}
