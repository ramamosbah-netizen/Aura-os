import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * BFF: abandon a project, with a reason.
 *
 * Separate from the status route because cancellation carries evidence the other transitions do
 * not — the actor comes from the session on the API side, and the reason is required. It is the
 * only path that can write `cancelled`; the status route refuses it.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const res = await apiFetch(`${apiBase()}/api/v1/projects/projects/${id}/cancel`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
