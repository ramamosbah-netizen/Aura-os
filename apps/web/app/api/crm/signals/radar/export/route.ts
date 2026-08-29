import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** Server-backed export: the API applies the same tenant/filter semantics without a page limit. */
export async function GET(request: Request): Promise<Response> {
  try {
    const search = new URL(request.url).search;
    const res = await apiFetch(`${apiBase()}/api/v1/crm/signals/radar/export${search}`, {
      headers: await authHeader(), cache: 'no-store',
    });
    return new Response(await res.text(), { status: res.status, headers: {
      'content-type': res.headers.get('content-type') ?? 'text/csv; charset=utf-8',
      'content-disposition': res.headers.get('content-disposition') ?? 'attachment; filename="sales-radar.csv"',
    }});
  } catch { return Response.json({ error: 'CRM API unreachable' }, { status: 502 }); }
}
