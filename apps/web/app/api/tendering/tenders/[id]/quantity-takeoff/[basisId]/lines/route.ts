import { apiBase, apiFetch, authHeader } from '@/lib/api';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; basisId: string }> }): Promise<Response> {
  const { id, basisId } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${id}/quantity-takeoff/${basisId}/lines`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(await request.json().catch(() => ({}))), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
