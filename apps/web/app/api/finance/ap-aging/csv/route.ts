import { apiBase, authHeader } from '@/lib/api';

// BFF: stream the AP-aging CSV export (gap #10) so the browser gets a file download.
export async function GET(request: Request): Promise<Response> {
  const asOf = new URL(request.url).searchParams.get('asOf');
  const qs = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
  try {
    const res = await fetch(`${apiBase()}/api/v1/finance/invoices/aging.csv${qs}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="ap-aging.csv"',
      },
    });
  } catch {
    return Response.json({ error: 'Finance API unreachable' }, { status: 502 });
  }
}
