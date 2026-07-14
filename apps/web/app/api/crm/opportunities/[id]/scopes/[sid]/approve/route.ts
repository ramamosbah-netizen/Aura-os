import { apiBase, authHeader } from '@/lib/api';

// BFF: approve a solution scope (R4).
export async function POST(_r: Request, { params }: { params: Promise<{ id: string; sid: string }> }): Promise<Response> {
  const { id, sid } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/opportunities/${id}/scopes/${sid}/approve`, {
      method: 'POST', headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
