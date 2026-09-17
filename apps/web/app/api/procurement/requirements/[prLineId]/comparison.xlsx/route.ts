import { apiBase, apiFetch, authHeader } from '@/lib/api';

// BFF: stream the API's commercial comparison workbook (SUP-06) straight through.
//
// The workbook is built by the API from the SAME service call the screen reads, so it cannot drift
// from what the buyer was looking at. Nothing is rebuilt here.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ prLineId: string }> },
): Promise<Response> {
  const { prLineId } = await params;
  const url = new URL(request.url);
  const query = new URLSearchParams();
  for (const key of ['comparisonDate', 'baseCurrency']) {
    const value = url.searchParams.get(key);
    if (value) query.set(key, value);
  }
  try {
    const res = await apiFetch(
      `${apiBase()}/api/v1/procurement/quotations/by-requirement/${prLineId}/comparison.xlsx?${query}`,
      { headers: await authHeader(), cache: 'no-store' },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return Response.json(body, { status: res.status });
    }
    return new Response(await res.arrayBuffer(), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': res.headers.get('content-disposition') ?? 'attachment; filename="commercial-comparison.xlsx"',
      },
    });
  } catch {
    return Response.json({ error: 'Procurement API unreachable' }, { status: 502 });
  }
}
