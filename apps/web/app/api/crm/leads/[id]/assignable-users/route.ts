import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: who this user may assign the lead to (a rep sees only themself). INT-03 — without this route
// the Lead 360 assign control received nothing and hid itself, so no lead could be assigned on screen.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/leads/${id}/assignable-users`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
