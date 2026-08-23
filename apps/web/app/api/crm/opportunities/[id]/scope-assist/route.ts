import { apiBase, authHeader } from '@/lib/api';

// BFF: the deal's Scope Assist proposals, newest first, each carrying a DERIVED evidenceStale flag.

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/opportunities/${id}/scope-assist`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
