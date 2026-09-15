import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Commit today's planned dates as the baseline. The body CARRIES THE REASON: taking the first
// baseline is free, replacing one costs a sentence, and a pass-through that dropped the body would
// make every re-baseline fail as "no reason given" while the planner watched themselves type one.
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await params;
  try {
    const body = await request.text();
    const res = await apiFetch(`${apiBase()}/api/v1/projects/schedules/${projectId}/baseline`, {
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
