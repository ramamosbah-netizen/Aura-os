import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: price one material component from a governed supplier quotation line. Only the line id and
// the comparison date travel — the API takes the figure from the governed comparison, never from us.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; buildUpId: string; componentId: string }> },
): Promise<Response> {
  const { id, buildUpId, componentId } = await params;
  const body = (await request.json().catch(() => ({}))) as { quotationLineId?: unknown; comparisonDate?: unknown };
  const quotationLineId = typeof body.quotationLineId === 'string' ? body.quotationLineId : '';
  if (!quotationLineId) return Response.json({ message: 'quotationLineId is required' }, { status: 400 });
  const comparisonDate = typeof body.comparisonDate === 'string' ? body.comparisonDate : undefined;
  try {
    const res = await apiFetch(
      `${apiBase()}/api/v1/tendering/tenders/${id}/pricing/buildups/${buildUpId}/components/${componentId}/source`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ quotationLineId, ...(comparisonDate ? { comparisonDate } : {}) }),
        cache: 'no-store',
      },
    );
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
