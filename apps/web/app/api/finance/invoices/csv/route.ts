import { apiBase, authHeader } from '@/lib/api';

// BFF: stream the supplier-invoice register CSV export (gap #10).
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  try {
    const res = await fetch(`${apiBase()}/api/v1/finance/invoices/export.csv${qs ? `?${qs}` : ''}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="invoices.csv"',
      },
    });
  } catch {
    return Response.json({ error: 'Finance API unreachable' }, { status: 502 });
  }
}
