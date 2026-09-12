import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Raise a defect against a system (TC-GATE-2).
 *
 * `testItemId` / `sourceRunId` carry provenance into T&C's own test evidence, so a defect raised
 * from a failing run is visibly the SAME problem rather than a second one that happens to sit on the
 * same system. Both optional: a defect found by eye on a walk-around has no test to point at.
 *
 * This is the commissioning punch authority, which T&C already owns. It is NOT a Quality snag and
 * NOT an NCR — escalation into those needs a Quality-side writer and is a Gate-3 dependency.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    description?: string;
    severity?: string;
    location?: string;
    testItemId?: string;
    sourceRunId?: string;
  };

  if (!body.description?.trim()) return Response.json({ error: 'description is required' }, { status: 400 });

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/${id}/punch`, {
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
