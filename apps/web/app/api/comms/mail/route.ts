import { apiBase, authHeader } from '@/lib/api';

// BFF: the caller's mailbox (inbox + sent + unread) and mail send.
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/comms/mail`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Comms API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/comms/mail`, {
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
