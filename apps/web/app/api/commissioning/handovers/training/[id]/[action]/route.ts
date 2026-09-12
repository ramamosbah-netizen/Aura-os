import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** `complete` records that the session happened; `acknowledge` is the client's own word for it. */
const ACTIONS = new Set(['complete', 'acknowledge']);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
): Promise<Response> {
  const { id, action } = await params;
  if (!ACTIONS.has(action)) return Response.json({ error: `unknown action ${action}` }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/handovers/training/${id}/${action}`, {
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
