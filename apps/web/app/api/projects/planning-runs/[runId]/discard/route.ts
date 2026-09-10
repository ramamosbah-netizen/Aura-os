import { apiFetch, apiBase, authHeader } from '@/lib/api';

// §22 Step 12 — reject a proposal outright. The reason is required (enforced by the API).
export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }): Promise<Response> {
  const { runId } = await params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/planning-runs/${runId}/discard`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ reason: body.reason ?? '' }),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
