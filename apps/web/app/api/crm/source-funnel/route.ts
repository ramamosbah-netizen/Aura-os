import { apiBase, authHeader } from '@/lib/api';

// BFF: C5 / G15 — Source → Wins → Contract Value → Actual Margin.

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/source-funnel`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
