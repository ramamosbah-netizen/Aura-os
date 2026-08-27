import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: add a scope basis revision (draft) to the package.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  // These commands are posted with no body from the panel; an absent body is a legal empty command.
  const payload = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/opportunities/${id}/pre-award-package/scope`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(payload), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
