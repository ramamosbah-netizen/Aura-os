import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: the favourite TOGGLE. apps/web proxies the API per-path, so without this file the endpoint
// exists on the API and still 404s from the browser.
//
// A static `favorite` segment sits beside `[id]`; Next resolves the literal first, so this never
// shadows `DELETE /api/views/:id`.
export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/views/favorite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'API unreachable' }, { status: 502 }); }
}
