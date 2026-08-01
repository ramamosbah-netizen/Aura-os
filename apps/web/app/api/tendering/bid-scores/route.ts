import { apiBase, authHeader } from '@/lib/api';

// BFF: tender Go/No-Go qualification (bid scores). GET lists a tender's assessments (newest first);
// POST records a new one — the API computes the authoritative weighted score + recommendation.
export async function GET(request: Request): Promise<Response> {
  const tenderId = new URL(request.url).searchParams.get('tenderId') ?? '';
  try {
    const res = await fetch(`${apiBase()}/api/v1/tendering/bid-scores?tenderId=${encodeURIComponent(tenderId)}`, {
      headers: { ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/tendering/bid-scores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
