import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * BFF: find suppliers by name or code, a page at a time. A picker built on the plain list would stop
 * at its cap and simply not offer the supplier the buyer is looking for.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = new URLSearchParams({ limit: url.searchParams.get('limit') ?? '20', offset: url.searchParams.get('offset') ?? '0' });
  const q = url.searchParams.get('q')?.trim();
  if (q) query.set('q', q);
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/procurement/suppliers/paged?${query}`, { headers: await authHeader(), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Procurement API unreachable' }, { status: 502 });
  }
}
