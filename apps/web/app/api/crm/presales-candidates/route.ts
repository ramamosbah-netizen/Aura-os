import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** Who Sales may assign a Pre-Sales study to, and who may review it — read under the deal-team grant. */
export async function GET(): Promise<Response> {
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/presales-candidates`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
