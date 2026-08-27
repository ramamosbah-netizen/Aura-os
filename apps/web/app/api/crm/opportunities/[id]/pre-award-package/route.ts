import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: the whole Pre-Award package aggregate — package + basis + estimates + pricing + derived
// governance. The Commercial panel derives EVERY readiness gate from this response.

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/opportunities/${id}/pre-award-package`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
