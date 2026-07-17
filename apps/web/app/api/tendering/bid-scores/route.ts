import { apiBase, authHeader } from '@/lib/api';

// BFF: tender bid-scoring (Go/No-Go) — the decision the submission gate requires.

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const tenderId = url.searchParams.get('tenderId');
  const qs = tenderId ? `?tenderId=${encodeURIComponent(tenderId)}` : '';
  try {
    const res = await fetch(`${apiBase()}/api/v1/tendering/bid-scores${qs}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    tenderId?: unknown;
    tenderTitle?: unknown;
    criteria?: unknown;
    notes?: unknown;
  };
  if (typeof body.tenderId !== 'string' || !body.tenderId) {
    return Response.json({ error: 'tenderId required' }, { status: 400 });
  }
  if (!Array.isArray(body.criteria) || body.criteria.length === 0) {
    return Response.json({ error: 'at least one criterion is required' }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiBase()}/api/v1/tendering/bid-scores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        tenderId: body.tenderId,
        tenderTitle: typeof body.tenderTitle === 'string' ? body.tenderTitle : undefined,
        criteria: body.criteria,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
