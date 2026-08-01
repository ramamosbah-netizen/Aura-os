import { apiBase, authHeader } from '@/lib/api';

// BFF: save the draft sheet's lines. 409 relayed when the sheet is frozen.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/pricing-sheets/${id}/lines`, {
      method: 'PUT', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
