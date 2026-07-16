import { apiBase, authHeader } from '@/lib/api';

// BFF: C6 (§7 exec) — win/loss intelligence + revenue concentration over a period.

export async function GET(req: Request): Promise<Response> {
  const days = new URL(req.url).searchParams.get('days');
  const qs = days ? `?days=${encodeURIComponent(days)}` : '';
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/executive${qs}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
