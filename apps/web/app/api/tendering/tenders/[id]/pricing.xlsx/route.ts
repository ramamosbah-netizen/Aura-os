import { apiBase, apiFetch, authHeader } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Authenticated BFF stream for the internal Tender pricing workbook. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const upstream = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${encodeURIComponent(id)}/pricing.xlsx`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const headers = new Headers();
    for (const name of ['content-type', 'content-disposition', 'content-length']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set('cache-control', 'private, no-store');
    headers.set('x-content-type-options', 'nosniff');
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json({ message: 'Tender pricing workbook service unreachable' }, { status: 502 });
  }
}
