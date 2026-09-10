import { apiFetch, apiBase, authHeader } from '@/lib/api';

// §22 Step 12 — promote a proposal to the current plan. A not-established proposal carries an
// acknowledgeReason; the API refuses it otherwise (a 400 through the error taxonomy), forwarded here.
export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }): Promise<Response> {
  const { runId } = await params;
  const body = (await request.json().catch(() => ({}))) as { acknowledgeReason?: string };
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/planning-runs/${runId}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ acknowledgeReason: body.acknowledgeReason ?? null }),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
