import { apiFetch, apiBase, authHeader } from '@/lib/api';

// One proxy for the handover state transitions: checklist · submit · accept · reject.
// The action segment is allow-listed so only the known verbs reach the API.
const ALLOWED = new Set(['checklist', 'submit', 'accept', 'reject']);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
): Promise<Response> {
  const { id, action } = await params;
  if (!ALLOWED.has(action)) {
    return Response.json({ error: 'unknown handover action' }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/handovers/${id}/${action}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Handover API unreachable' }, { status: 502 });
  }
}
