import { apiFetch, apiBase, authHeader } from '@/lib/api';

export async function GET(): Promise<Response> {
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/quotations`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(res.ok ? await res.json() : [], { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json([], { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const replayHeaders: Record<string, string> = {};
    for (const name of ['Idempotency-Key', 'Replay-Nonce']) {
      const value = request.headers.get(name);
      if (value) replayHeaders[name] = value;
    }
    const res = await apiFetch(`${apiBase()}/api/v1/crm/quotations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...replayHeaders, ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
