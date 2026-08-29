import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: accepted quotation → draft contract (the deal chain continues).

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const replay = request.headers.get('Idempotency-Key');
    const res = await apiFetch(`${apiBase()}/api/v1/crm/quotations/${id}/convert-to-contract`, {
      method: 'POST',
      headers: { ...(replay ? { 'Idempotency-Key': replay } : {}), ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
