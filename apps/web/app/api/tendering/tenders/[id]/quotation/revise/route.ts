import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: revise the tender's one offer — with a reason, regenerated from the current estimate (EST-16).

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const res = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${id}/quotation/revise`, {
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
