import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: Opportunity Radar — open signals + triage counts by status / source / type.

export async function GET(request: Request): Promise<Response> {
  try {
    const search = new URL(request.url).search;
    const res = await apiFetch(`${apiBase()}/api/v1/crm/signals/radar${search}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
