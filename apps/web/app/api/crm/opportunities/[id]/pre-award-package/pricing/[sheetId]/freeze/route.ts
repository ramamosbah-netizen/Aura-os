import { apiBase, authHeader } from '@/lib/api';

// BFF: Pricing Workspace (Slice 7) — [sheetId]/freeze.

export async function POST(request: Request, { params }: { params: Promise<{ id: string; sheetId: string }> }): Promise<Response> {
  const { id, sheetId } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/opportunities/${id}/pre-award-package/pricing/${sheetId}/freeze`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(await request.json().catch(() => ({}))), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
