import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** Quality adopts a published template into a project as the next revision of that system's checklist. */
export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  return forward('POST', '/itps/system', body);
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
