import { apiFetch, apiBase, authHeader } from '@/lib/api';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; studyId: string }> }): Promise<Response> {
  const { id, studyId } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/opportunities/${id}/pre-award-package/studies/${studyId}/submit`, {
      method: 'POST', headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
