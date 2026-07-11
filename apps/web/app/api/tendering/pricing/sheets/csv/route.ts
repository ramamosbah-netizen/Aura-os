import { apiBase, authHeader } from '@/lib/api';

// BFF: stream the all-sheets summary CSV as a file download.

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/tendering/tenders/pricing/sheets.csv`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="pricing-sheets.csv"',
      },
    });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
