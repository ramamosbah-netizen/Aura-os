import { apiBase, authHeader } from '@/lib/api';

// BFF: opportunity → draft quotation (the direct-sale route of the deal chain).
// The API has always had this endpoint; the proxy was missing, so the "→ Quotation" button on
// Opportunity 360 and the pipeline's convert action both 404'd — silently, because neither caller
// checks res.ok. Takes no body: the API derives the quotation from the opportunity.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/opportunities/${id}/convert-to-quotation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
