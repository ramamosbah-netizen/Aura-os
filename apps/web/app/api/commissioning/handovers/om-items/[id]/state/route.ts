import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Move a deliverable one step along: required → submitted → reviewed → accepted.
 *
 * One step at a time, in order — the API refuses a jump, because an acceptance nobody reviewed is
 * the thing this authority exists to prevent. Submitting needs a controlled document reference.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { to?: string; documentId?: string; notes?: string };
  if (!body.to) return Response.json({ error: 'to is required' }, { status: 400 });
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/handovers/om-items/${id}/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Handover API unreachable' }, { status: 502 });
  }
}
