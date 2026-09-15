import { apiBase, apiFetch, authHeader } from '@/lib/api';

// The project's milestones, each resolved against the programme as it stands. The STATUS is derived
// by the API on every read — never stored — so a milestone cannot read "on track" against a
// programme that slipped last week.
export async function GET(_request: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/schedules/${encodeURIComponent(projectId)}/milestones`, {
      headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}

// Author one. The body carries the name, the committed date and what gates it — forwarded whole,
// because a pass-through that dropped it would send a milestone with no target and no gates.
export async function POST(request: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;
  try {
    const body = await request.text();
    const res = await apiFetch(`${apiBase()}/api/v1/projects/schedules/${encodeURIComponent(projectId)}/milestones`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: body || '{}',
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
