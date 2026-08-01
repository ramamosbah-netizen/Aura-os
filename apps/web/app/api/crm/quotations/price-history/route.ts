import { apiBase, authHeader } from '@/lib/api';

// BFF: what an item has been quoted for before — the historic half of the pricing library. Static
// segment so Next matches it before the dynamic [id] route.
export async function GET(req: Request): Promise<Response> {
  const qs = new URL(req.url).search;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/quotations/price-history${qs}`, { headers: await authHeader(), cache: 'no-store' });
    const data = await res.json().catch(() => []);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
