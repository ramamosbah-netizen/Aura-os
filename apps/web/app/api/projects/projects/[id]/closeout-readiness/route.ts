import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Closeout readiness for one project.
 *
 * A pass-through: the verdict is assembled by the domain that also enforces it at finalization, so
 * this route adds no judgement of its own. Anything it computed here would be a second opinion the
 * write would not honour.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/projects/${encodeURIComponent(id)}/closeout-readiness`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
