import { apiBase, authHeader } from '@/lib/api';

// BFF: the Estimation Workspace read — one estimate + its build-ups + the basis lines it costs.

export async function GET(_r: Request, { params }: { params: Promise<{ id: string; estimateId: string }> }): Promise<Response> {
  const { id, estimateId } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/opportunities/${id}/pre-award-package/estimate/${estimateId}`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
