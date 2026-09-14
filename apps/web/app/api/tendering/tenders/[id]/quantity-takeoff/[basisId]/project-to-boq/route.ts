import { apiBase, apiFetch, authHeader } from '@/lib/api';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; basisId: string }> }): Promise<Response> {
  const { id, basisId } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${id}/quantity-takeoff/${basisId}/project-to-boq`, {
      method: 'POST', headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
