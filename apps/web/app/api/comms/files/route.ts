import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: attachment metadata from conversations the authenticated caller may access.
// Document Control remains the source of truth for controlled documents and versions.
export async function GET(): Promise<Response> {
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/comms/files`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch {
    return Response.json({ error: 'Comms API unreachable' }, { status: 502 });
  }
}
