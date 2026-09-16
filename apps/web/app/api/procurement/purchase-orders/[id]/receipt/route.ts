import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Where this order stands on delivery, line by line.
 *
 * Reads the API's composed position rather than assembling one here: a screen that added up its own
 * outstanding figures would be a second implementation of the rule, free to disagree with the one
 * that decides the order's status.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(
      `${apiBase()}/api/v1/procurement/purchase-orders/${encodeURIComponent(id)}/lines/receipt`,
      { headers: await authHeader(), cache: 'no-store' },
    );
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Order receipt API unreachable' }, { status: 502 });
  }
}
