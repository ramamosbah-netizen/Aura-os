import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: the authenticated caller's unread chat/mail projection.
export async function GET(): Promise<Response> {
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/comms/unread/items`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch {
    return Response.json({ error: 'Comms API unreachable' }, { status: 502 });
  }
}
