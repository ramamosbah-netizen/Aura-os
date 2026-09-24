import { apiFetch, apiBase, authHeader } from '@/lib/api';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: unknown;
  };

  const status = typeof body.status === 'string' ? body.status : '';
  if (!status) return Response.json({ error: 'status is required' }, { status: 400 });

  // Approving or rejecting is a DECISION and has its own API route, gated by the decision's own
  // permission (`procurement.pr.approve`). The screens keep one path; the BFF picks the door.
  const route = status === 'approved' || status === 'rejected' ? 'decision' : 'status';

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/procurement/purchase-requests/${id}/${route}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ status }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Procurement PR API unreachable' }, { status: 502 });
  }
}
