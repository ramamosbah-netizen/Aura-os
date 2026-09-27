import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: EST-17 — the approval route of an offer: the policy version it started under, its steps in
// sequence, who approved each and what it waits on.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/quotations/${encodeURIComponent(id)}/approval`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
