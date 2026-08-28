import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** BFF for the complete, filtered contact register export. */
export async function GET(req: Request): Promise<Response> {
  const qs = new URL(req.url).search;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/contacts/export.csv${qs}`, {
      headers: await authHeader(), cache: 'no-store',
    });
    return new Response(res.body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'text/csv; charset=utf-8',
        'content-disposition': res.headers.get('content-disposition') ?? 'attachment; filename="contacts.csv"',
      },
    });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
