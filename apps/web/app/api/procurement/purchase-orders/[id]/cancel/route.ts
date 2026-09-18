import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Cancelling REQUIRES a reason, so this route forwards the body rather than dropping it — the
// others carry nothing to forward.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/procurement/purchase-orders/${id}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: await request.text(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Procurement API unreachable' }, { status: 502 });
  }
}
