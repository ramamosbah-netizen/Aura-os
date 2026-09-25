import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** T&C routes a defect that needs a design correction to a named Design / Technical Engineer (TC-08). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; punchId: string }> },
): Promise<Response> {
  const { id, punchId } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/${id}/punch/${punchId}/route-to-engineering`, {
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
