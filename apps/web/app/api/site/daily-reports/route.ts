import { apiFetch, apiBase, authHeader, replayHeaders } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    projectName?: string;
    date?: string;
    workDescription?: string;
    manpowerCount?: number;
    equipmentCount?: number;
  };

  if (typeof body.projectId !== 'string' || !body.projectId.trim()) {
    return Response.json({ error: 'projectId is required', message: 'Select a project before creating a daily report.' }, { status: 400 });
  }
  if (!body.date || !body.workDescription) {
    return Response.json({ error: 'date and workDescription required' }, { status: 400 });
  }

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/site/daily-reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()), ...replayHeaders(request) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Site API unreachable' }, { status: 502 });
  }
}

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
    const res = await apiFetch(`${apiBase()}/api/v1/site/daily-reports${suffix}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Site API unreachable' }, { status: 502 });
  }
}
