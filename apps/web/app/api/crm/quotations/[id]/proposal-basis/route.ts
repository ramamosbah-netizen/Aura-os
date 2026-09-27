import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: EST-18 — the customer-facing basis of an offer: its approved study scope, revision lineage
// and issues to the customer.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/quotations/${encodeURIComponent(id)}/proposal-basis`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
