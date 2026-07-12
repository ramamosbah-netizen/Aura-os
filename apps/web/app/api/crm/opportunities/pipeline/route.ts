import { apiBase, authHeader } from '@/lib/api';

// BFF: Sales Pipeline Command Center — portfolio KPIs, forecast, aging, stalled,
// owner performance, and at-risk deals in one payload.

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/opportunities/pipeline`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
