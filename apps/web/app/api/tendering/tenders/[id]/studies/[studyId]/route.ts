import { apiFetch, apiBase, authHeader } from '@/lib/api';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; studyId: string }> }): Promise<Response> {
  const { id, studyId } = await params;
  try {
    const result = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${encodeURIComponent(id)}/studies/${encodeURIComponent(studyId)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(await request.json().catch(() => ({}))), cache: 'no-store',
    });
    return Response.json(await result.json().catch(() => ({})), { status: result.status });
  } catch { return Response.json({ error: 'Tender study service unavailable' }, { status: 502 }); }
}
