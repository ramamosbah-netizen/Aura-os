import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: approve one scope basis revision — the first governed gate.

export async function POST(request: Request, { params }: { params: Promise<{ id: string; basisId: string }> }): Promise<Response> {
  const { id, basisId } = await params;
  // These commands are posted with no body from the panel; an absent body is a legal empty command.
  const payload = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/opportunities/${id}/pre-award-package/scope/${basisId}/approve`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(payload), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
