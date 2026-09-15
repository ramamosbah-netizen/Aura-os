import { apiBase, apiFetch, authHeader } from '@/lib/api';

// Name the calendar a project's dates are counted under, or clear it by sending no id. The API
// owns the permission and checks the calendar belongs to the tenant; this carries the request.
export async function POST(
  request: Request,
  props: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const { projectId } = await props.params;
  try {
    const body = await request.text();
    const res = await apiFetch(
      `${apiBase()}/api/v1/projects/schedules/${encodeURIComponent(projectId)}/working-calendar`,
      { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body, cache: 'no-store' },
    );
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
