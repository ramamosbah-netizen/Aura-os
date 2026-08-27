import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: edit the lines of a DRAFT scope basis — the human half of Accept != Approve.

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; basisId: string }> }): Promise<Response> {
  const { id, basisId } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/opportunities/${id}/pre-award-package/scope/${basisId}/lines`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(await request.json().catch(() => ({}))), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
