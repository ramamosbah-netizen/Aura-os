import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: create a named internal team conversation for the authenticated caller.
export async function POST(request: Request): Promise<Response> {
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/comms/team`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(await request.json().catch(() => ({}))),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Comms API unreachable' }, { status: 502 });
  }
}
