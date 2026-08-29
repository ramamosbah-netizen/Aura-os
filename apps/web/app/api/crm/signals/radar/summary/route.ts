import { apiFetch, apiBase, authHeader } from '@/lib/api';

export async function GET(request: Request): Promise<Response> {
  try {
    const search = new URL(request.url).search;
    const res = await apiFetch(`${apiBase()}/api/v1/crm/signals/radar/summary${search}`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
