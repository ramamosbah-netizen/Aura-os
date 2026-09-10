import { apiFetch, apiBase, authHeader } from '@/lib/api';

// §22 Step 12 — one planning run, with what accepting it would change against the current plan.
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }): Promise<Response> {
  const { runId } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/planning-runs/${runId}`, {
      headers: { ...(await authHeader()) },
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
