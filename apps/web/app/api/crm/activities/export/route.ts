import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** BFF: server-generated CSV for the complete filtered Activity register. */
export async function GET(req: Request): Promise<Response> {
  const qs = new URL(req.url).search;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/activities/export${qs}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'text/csv; charset=utf-8' },
    });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
