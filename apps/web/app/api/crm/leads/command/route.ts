import { apiBase, authHeader } from '@/lib/api';

// BFF: Lead Command — attention-scored leads + view counts (All / Mine / Needs Attention / Nurture).

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/leads/command`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
