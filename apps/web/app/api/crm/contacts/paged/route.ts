import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** BFF for the bounded CRM contacts register. Query params are passed through to the API. */
export async function GET(req: Request): Promise<Response> {
  const qs = new URL(req.url).search;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/contacts/paged${qs}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({ items: [], total: 0, limit: 0, offset: 0, hasMore: false }));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
