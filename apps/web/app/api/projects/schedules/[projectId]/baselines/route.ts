import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Every baseline this programme has had, newest first — what makes superseding one an addition
// rather than a destruction.
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/schedules/${projectId}/baselines`, {
      headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ([])), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
