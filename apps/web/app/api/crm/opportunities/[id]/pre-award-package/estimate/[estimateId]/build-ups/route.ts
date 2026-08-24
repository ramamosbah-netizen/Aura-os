import { apiBase, authHeader } from '@/lib/api';

// BFF: edit a DRAFT estimate's per-line resource build-ups (Estimation Workspace, Slice 6B).

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; estimateId: string }> }): Promise<Response> {
  const { id, estimateId } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/opportunities/${id}/pre-award-package/estimate/${estimateId}/build-ups`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(await request.json().catch(() => ({}))), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
