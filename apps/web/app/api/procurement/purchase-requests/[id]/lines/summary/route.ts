import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** What the requisition adds up to, whether that sum is complete, and whether it may be submitted. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(
      `${apiBase()}/api/v1/procurement/purchase-requests/${encodeURIComponent(id)}/lines/summary`,
      { headers: await authHeader(), cache: 'no-store' },
    );
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Requisition lines API unreachable' }, { status: 502 });
  }
}
