import { apiBase, authHeader } from '@/lib/api';

// BFF: the caller's visible chat channels with unread counts.
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/comms/channels`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch {
    return Response.json({ error: 'Comms API unreachable' }, { status: 502 });
  }
}
