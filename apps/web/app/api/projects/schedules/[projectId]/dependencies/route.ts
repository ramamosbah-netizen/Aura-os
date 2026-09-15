import { apiBase, apiFetch, authHeader } from '@/lib/api';

// Replace a project's dependency network. The WHOLE network in one call, because a cycle is a
// property of the graph and not of an edge — the API validates it and names the loop on refusal.
export async function POST(
  request: Request,
  props: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const { projectId } = await props.params;
  try {
    const body = await request.text();
    const res = await apiFetch(
      `${apiBase()}/api/v1/projects/schedules/${encodeURIComponent(projectId)}/dependencies`,
      { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body, cache: 'no-store' },
    );
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
