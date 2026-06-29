import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: Request): Promise<Response> {
  const asOf = new URL(request.url).searchParams.get('asOf');
  const qs = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
  try {
    const res = await fetch(`${apiBase()}/api/v1/finance/customer-invoices/aging${qs}`, { headers: await authHeader(), cache: 'no-store' });
    const data = await res.json().catch(() => null);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(null, { status: 502 });
  }
}
