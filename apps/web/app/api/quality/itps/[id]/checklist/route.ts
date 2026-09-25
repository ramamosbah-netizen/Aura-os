import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** Adapt a DRAFT revision's points to the project. Submitted and approved revisions are refused. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return forward('PUT', `/itps/${id}/checklist`, body);
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
