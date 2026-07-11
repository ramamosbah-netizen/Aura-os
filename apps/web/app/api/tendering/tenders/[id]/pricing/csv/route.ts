import { apiBase, authHeader } from '@/lib/api';

// BFF: stream one tender's full cost & resource breakdown as a CSV download.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/tendering/tenders/${id}/pricing/export.csv`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="pricing-sheet-${id.slice(0, 8)}.csv"`,
      },
    });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
