import { apiFetch, apiBase, authHeader } from '@/lib/api';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const replay = request.headers.get('Idempotency-Key');
    const res = await apiFetch(`${apiBase()}/api/v1/crm/quotations/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(replay ? { 'Idempotency-Key': replay } : {}), ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
