import { apiBase, authHeader } from '@/lib/api';

// BFF: Relationship Intelligence — ranked cross-signal CRM alerts.

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/intelligence/alerts${qs ? `?${qs}` : ''}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({ counts: {}, alerts: [] }));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable', counts: {}, alerts: [] }, { status: 502 });
  }
}
