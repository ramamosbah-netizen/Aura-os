import { apiBase, authHeader } from '@/lib/api';

// BFF: mark a commitment fulfilled.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; cid: string }> },
): Promise<Response> {
  const { id, cid } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/opportunities/${id}/commitments/${cid}/fulfil`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
