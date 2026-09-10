import { apiFetch, apiBase, authHeader } from '@/lib/api';

// §22 Step 12 — planning runs for a project's schedule.
//   GET  → the schedule's runs, newest first.
//   POST → run the solver against resolved facts and persist a proposal; returns it + the comparison.

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/schedules/${projectId}/planning-runs`, {
      headers: { ...(await authHeader()) },
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ([])), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/schedules/${projectId}/planning-runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
