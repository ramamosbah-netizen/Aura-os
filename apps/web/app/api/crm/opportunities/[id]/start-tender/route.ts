import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: opportunity → linked draft Tender (the TENDER route of the deal chain, mirror of
// convert-to-quotation). Takes no body — the API derives the tender from the opportunity and
// returns it (so the client can jump into the tender workspace).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/opportunities/${id}/start-tender`, {
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
