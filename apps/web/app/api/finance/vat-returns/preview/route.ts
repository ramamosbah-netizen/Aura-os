import { apiBase, authHeader } from '@/lib/api';

// BFF: preview the output/input/net VAT for a period (no persistence).
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  if (!from || !to) return Response.json({ error: 'from and to required' }, { status: 400 });
  try {
    const res = await fetch(`${apiBase()}/api/v1/finance/vat-returns/preview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance API unreachable' }, { status: 502 });
  }
}
