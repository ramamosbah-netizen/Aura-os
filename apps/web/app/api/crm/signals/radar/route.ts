import { apiBase, authHeader } from '@/lib/api';

// BFF: Opportunity Radar — open signals + triage counts by status / source / type.

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/signals/radar`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
