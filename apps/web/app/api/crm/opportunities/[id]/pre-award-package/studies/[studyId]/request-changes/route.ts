import { apiFetch, apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request, { params }: { params: Promise<{ id: string; studyId: string }> }): Promise<Response> {
  const { id, studyId } = await params;
  const payload = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/opportunities/${id}/pre-award-package/studies/${studyId}/request-changes`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(payload), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
