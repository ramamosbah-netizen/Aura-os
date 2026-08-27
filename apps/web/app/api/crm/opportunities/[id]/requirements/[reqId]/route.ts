import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: correct a captured requirement, or retire it with status 'dropped' (the existing semantics —
// Scope Assist skips dropped requirements, so retiring one marks live proposals stale).

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; reqId: string }> }): Promise<Response> {
  const { id, reqId } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/opportunities/${id}/requirements/${reqId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(await request.json().catch(() => ({}))), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
