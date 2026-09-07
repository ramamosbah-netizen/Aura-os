import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * BFF: every lifecycle move available from this project's current state, each with the API's
 * verdict and — when it is refused — the reasons.
 *
 * Read-only on purpose. Project 360 renders its lifecycle buttons from this rather than deciding
 * for itself which are available: the page held a second copy of the rules and the two had already
 * drifted, so it offered "Start execution" on a project the API then refused for having no scope
 * and no baseline.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/projects/${id}/transitions`, {
      headers: { ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
