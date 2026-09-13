import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Forwards the project scope upstream.
 *
 * This handler took no arguments, so it could not pass anything on: a page asking for one
 * project sent `?projectId=…` and the API received a request for the whole tenant. For an
 * org-wide identity that was invisible; for a project MEMBER the unscoped read is REFUSED, so
 * the surface showed an error and the page looked broken to exactly the people it was for.
 *
 * Named parameters rather than the whole query string: a blind forward would pass anything a
 * caller appended, and this layer should carry what the page means, not whatever it was sent.
 */
export async function GET(request: Request): Promise<Response> {
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ['projectId', 'status', 'limit', 'offset', 'q']) {
    const value = incoming.get(key);
    if (value) query.set(key, value);
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/doccontrol/submittals${suffix}`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(res.ok ? await res.json() : [], { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json([], { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/doccontrol/submittals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'DocControl API unreachable' }, { status: 502 });
  }
}
