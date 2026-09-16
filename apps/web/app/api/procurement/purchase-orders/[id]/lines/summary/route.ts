import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** What the order comes to, and how it was arrived at — read from the lines, never declared. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(
      `${apiBase()}/api/v1/procurement/purchase-orders/${encodeURIComponent(id)}/lines/summary`,
      { headers: await authHeader(), cache: 'no-store' },
    );
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Order lines API unreachable' }, { status: 502 });
  }
}
