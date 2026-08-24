import { apiBase, authHeader } from '@/lib/api';

// BFF: Pricing Workspace read (GET) — one sheet + its cost baseline + editable flag.

export async function GET(_r: Request, { params }: { params: Promise<{ id: string; sheetId: string }> }): Promise<Response> {
  const { id, sheetId } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/opportunities/${id}/pre-award-package/pricing/${sheetId}`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
