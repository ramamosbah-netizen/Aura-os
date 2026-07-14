import { apiBase, authHeader } from '@/lib/api';

// BFF: generate a governed quotation from an approved solution scope (R4 → R3).
export async function POST(request: Request, { params }: { params: Promise<{ id: string; sid: string }> }): Promise<Response> {
  const { id, sid } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/opportunities/${id}/scopes/${sid}/generate-quotation`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(await request.json()), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
