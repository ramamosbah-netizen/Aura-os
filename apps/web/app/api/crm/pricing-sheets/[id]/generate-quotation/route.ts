import { apiBase, authHeader } from '@/lib/api';

// BFF: generate-quotation on a pricing sheet — governance verdicts (409) relayed verbatim.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/pricing-sheets/${id}/generate-quotation`, {
      method: 'POST', headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
