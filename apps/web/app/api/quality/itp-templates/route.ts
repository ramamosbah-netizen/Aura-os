import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** The tenant System Template Library (TC-08/TC-09): one versioned template per canonical system. */
export async function GET(request: Request): Promise<Response> {
  const system = new URL(request.url).searchParams.get('system');
  return forward('GET', `/itp-templates${system ? `?system=${encodeURIComponent(system)}` : ''}`);
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  return forward('POST', '/itp-templates', body);
}

async function forward(method: string, path: string, body?: unknown): Promise<Response> {
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/quality${path}`, {
      method,
      headers: body === undefined ? await authHeader() : { 'content-type': 'application/json', ...(await authHeader()) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Quality API unreachable' }, { status: 502 });
  }
}
