import { apiBase, authHeader } from '@/lib/api';

// BFF: open (or create) a direct-message channel with a peer.
export async function POST(request: Request): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/comms/dm`, {
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
