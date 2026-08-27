import { apiFetch, apiBase, authHeader } from '@/lib/api';

export async function GET(request: Request): Promise<Response> {
  try {
    // Preserve the optional path filter. The server owns visibility, so the BFF must forward the
    // filter instead of forcing the client to download every visible view and filter locally.
    const search = new URL(request.url).search;
    const res = await apiFetch(`${apiBase()}/api/v1/views${search}`, { headers: { ...(await authHeader()) }, cache: 'no-store' });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch { return Response.json({ error: 'API unreachable' }, { status: 502 }); }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/views`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch { return Response.json({ error: 'API unreachable' }, { status: 502 }); }
}
