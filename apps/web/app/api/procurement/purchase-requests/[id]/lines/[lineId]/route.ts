import { apiFetch, apiBase, authHeader } from '@/lib/api';

const line = (id: string, lineId: string) =>
  `${apiBase()}/api/v1/procurement/purchase-requests/${encodeURIComponent(id)}/lines/${encodeURIComponent(lineId)}`;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; lineId: string }> }): Promise<Response> {
  const { id, lineId } = await params;
  try {
    const res = await apiFetch(line(id, lineId), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: (await request.text()) || '{}',
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Requisition lines API unreachable' }, { status: 502 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; lineId: string }> }): Promise<Response> {
  const { id, lineId } = await params;
  try {
    const res = await apiFetch(line(id, lineId), { method: 'DELETE', headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Requisition lines API unreachable' }, { status: 502 });
  }
}
