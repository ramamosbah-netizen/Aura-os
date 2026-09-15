import { apiBase, apiFetch, authHeader } from '@/lib/api';

// State a figure against the measurement, or withdraw it by sending no value. The API owns the
// permission and the reason rule; this carries the request so there is one copy of each.
export async function POST(
  request: Request,
  props: { params: Promise<{ projectId: string; taskId: string }> },
): Promise<Response> {
  const { projectId, taskId } = await props.params;
  try {
    const body = await request.text();
    const res = await apiFetch(
      `${apiBase()}/api/v1/projects/schedules/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(taskId)}/progress`,
      { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body, cache: 'no-store' },
    );
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
