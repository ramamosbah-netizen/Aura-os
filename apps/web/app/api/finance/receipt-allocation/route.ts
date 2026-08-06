import { apiBase, authHeader } from '@/lib/api';

// BFF: preview (GET) and apply (POST) a multi-invoice customer receipt allocation.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const customerName = url.searchParams.get('customerName') ?? '';
  const amount = url.searchParams.get('amount') ?? '';
  const qs = new URLSearchParams({ customerName, amount }).toString();
  try {
    const res = await fetch(`${apiBase()}/api/v1/finance/customer-invoices/allocation-preview?${qs}`, { headers: await authHeader(), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/finance/customer-invoices/allocate-receipt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance API unreachable' }, { status: 502 });
  }
}
