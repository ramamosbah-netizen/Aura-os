import { apiBase, apiFetch, authHeader } from '@/lib/api';

// BFF: the governed commercial comparison (SUP-06), forwarded with identity.
//
// It forwards and returns; it does not compute. Every figure on the screen is the API's, so the
// screen and the spreadsheet and the PDF cannot disagree about what an offer is worth.
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
      `${apiBase()}/api/v1/procurement/quotations/by-requirement/${prLineId}/comparison?${query}`,
      { headers: await authHeader(), cache: 'no-store' },
    );
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Procurement API unreachable' }, { status: 502 });
  }
}
