import { apiBase, authHeader } from '@/lib/api';

// BFF: Product Knowledge — Market Intelligence as the single source. ONE read answers "what do we
// know about this item": product + productivity + alternatives, price history, supplier offers,
// and stock on hand. The picker and the workspace Intelligence pane read this and nothing else.
export async function GET(req: Request): Promise<Response> {
  const qs = new URL(req.url).search;
  try {
    const res = await fetch(`${apiBase()}/api/v1/market-intelligence/knowledge${qs}`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({ products: [], history: [], suppliers: [], inventory: [] })), { status: res.status });
  } catch {
    return Response.json({ error: 'API unreachable' }, { status: 502 });
  }
}
