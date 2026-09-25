import { apiFetch, apiBase, authHeader } from '@/lib/api';

const ALLOWED = new Set(['publish', 'retire']);

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  const { id, action } = await params;
  if (!ALLOWED.has(action)) return Response.json({ error: 'unknown action' }, { status: 404 });
  return forward('POST', `/itp-templates/${id}/${action}`, {});
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
