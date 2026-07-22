import { apiBase, authHeader } from '@/lib/api';

// BFF: the Market Intelligence catalogue — the pricing library the sheet item-picker searches.
export async function GET(req: Request): Promise<Response> {
  const qs = new URL(req.url).search;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/market-items${qs}`, { headers: await authHeader(), cache: 'no-store' });
    const data = await res.json().catch(() => []);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // POST /market-items?seed=1 seeds the starter catalogue; otherwise create one item.
  const path = url.searchParams.get('seed') ? 'crm/market-items/seed' : 'crm/market-items';
  const body = url.searchParams.get('seed') ? undefined : JSON.stringify(await req.json().catch(() => ({})));
  try {
    const res = await fetch(`${apiBase()}/api/v1/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      ...(body ? { body } : {}),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
