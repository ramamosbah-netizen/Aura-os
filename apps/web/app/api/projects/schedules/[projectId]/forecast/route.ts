import { apiBase, apiFetch, authHeader } from '@/lib/api';

// Baseline, planned and forecast finishes with the activities that decide the date. Derived by the
// API on every read from what has been installed, never from what the plan hopes.
export async function GET(_request: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/schedules/${encodeURIComponent(projectId)}/forecast`, {
      headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
