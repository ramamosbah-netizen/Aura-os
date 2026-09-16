import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * A BOQ item's live position — and for `BUY-06`, the number that matters is `issued`: how much of
 * this material is currently out on site, issues minus returns.
 *
 * Read from the API rather than derived in a screen: a storekeeper deciding what can come back must
 * see the same balance the server will measure their return against, or the refusal arrives as a
 * surprise.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ boqItemId: string }> }): Promise<Response> {
  const { boqItemId } = await params;
  try {
    const res = await apiFetch(
      `${apiBase()}/api/v1/projects/quantity-ledger/position/${encodeURIComponent(boqItemId)}`,
      { headers: await authHeader(), cache: 'no-store' },
    );
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
