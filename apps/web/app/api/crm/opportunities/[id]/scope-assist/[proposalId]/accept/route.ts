import { apiBase, authHeader } from '@/lib/api';

// BFF: accept a suggestion into an EDITABLE draft basis. Accept is NOT approve.

export async function POST(request: Request, { params }: { params: Promise<{ id: string; proposalId: string }> }): Promise<Response> {
  const { id, proposalId } = await params;
  // These commands are posted with no body from the panel; an absent body is a legal empty command.
  const payload = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/opportunities/${id}/scope-assist/${proposalId}/accept`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(payload), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
