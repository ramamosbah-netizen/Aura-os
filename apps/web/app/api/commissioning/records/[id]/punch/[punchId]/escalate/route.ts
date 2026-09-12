import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Record that a defect needs a Quality non-conformance, and the NCR that answers it (TC-GATE-3).
 *
 * T&C never raises the NCR: Quality owns that record and its lifecycle. What is written here is
 * T&C's own note about its own defect, plus a REFERENCE to the Quality record a person raised.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; punchId: string }> },
): Promise<Response> {
  const { id, punchId } = await params;
  const body = (await request.json().catch(() => ({}))) as { qualityNcrId?: string };
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/${id}/punch/${punchId}/escalate`, {
      method: 'PUT',
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
