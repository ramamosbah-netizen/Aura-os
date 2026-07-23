import { apiBase, authHeader } from '@/lib/api';

// BFF: PricingSheets — the workspace's aggregate. List (by opportunity/quotation) and create.
export async function GET(req: Request): Promise<Response> {
  const qs = new URL(req.url).search;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/pricing-sheets${qs}`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/pricing-sheets`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
