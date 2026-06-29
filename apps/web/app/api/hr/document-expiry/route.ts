import { apiBase, authHeader } from '@/lib/api';

// BFF: employee document-expiry watch-list (visa + labour permit), bucketed by urgency.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const qs = new URLSearchParams();
  for (const k of ['asOf', 'criticalDays', 'warningDays']) {
    const v = url.searchParams.get(k);
    if (v) qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  try {
    const res = await fetch(`${apiBase()}/api/v1/hr/employees/document-expiry${suffix}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(res.ok ? await res.json() : { items: [], counts: {} }, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({ items: [], counts: {} }, { status: 502 });
  }
}
