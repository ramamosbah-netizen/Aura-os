import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Record one EXECUTION of a test point (TC-GATE-1).
 *
 * POST, not PUT: this appends a run to the point's lineage rather than replacing its result, so it
 * is deliberately not idempotent — sending it twice records two executions, which is what a retest
 * is. A failing run must carry remarks; the API refuses it otherwise and that message is passed
 * through rather than flattened, because it tells the tester exactly what is missing.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
): Promise<Response> {
  const { id, itemId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    result?: 'pass' | 'fail';
    actual?: string;
    remarks?: string;
  };

  if (body.result !== 'pass' && body.result !== 'fail') {
    return Response.json({ error: 'result must be pass or fail' }, { status: 400 });
  }

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/${id}/test-items/${itemId}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Commissioning API unreachable' }, { status: 502 });
  }
}
