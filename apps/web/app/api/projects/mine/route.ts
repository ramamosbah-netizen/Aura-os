import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * BFF for governed project discovery.
 *
 * A pass-through on purpose: the API decides what this caller may see, and the only job here is to
 * carry the session's identity to it. Filtering anything in this layer would move an authorisation
 * decision out of the place that can make it and into one that cannot.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = new URLSearchParams();
  for (const key of ['q', 'limit', 'offset']) {
    const value = url.searchParams.get(key);
    if (value) query.set(key, value);
  }

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/projects/mine?${query.toString()}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
