import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Add a test point to a system's sheet (TC-GATE-2).
 *
 * A point is a DEFINITION — what must be proven and the value it must meet — and it was previously
 * creatable only through the API, so a sheet could be executed from the app but never authored in
 * it. This exposes the writer T&C already owns; it does not create a test-plan authority. Quality's
 * ITP remains the QA inspection plan and is untouched.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { pointNo?: string; description?: string; expected?: string };

  if (!body.pointNo?.trim()) return Response.json({ error: 'pointNo is required' }, { status: 400 });
  if (!body.description?.trim()) return Response.json({ error: 'description is required' }, { status: 400 });

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/${id}/test-items`, {
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
