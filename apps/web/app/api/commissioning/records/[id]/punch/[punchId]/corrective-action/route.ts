import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** The engineer the defect was routed to records its corrective action (TC-08). It does not close it. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; punchId: string }> },
): Promise<Response> {
  const { id, punchId } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/${id}/punch/${punchId}/corrective-action`, {
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
