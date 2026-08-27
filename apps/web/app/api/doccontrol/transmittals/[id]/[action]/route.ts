import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Transmittal conveyance-command forwarder (G-33): send / receive (POST). `acknowledge` keeps its
// own PUT route. The backend enforces the lifecycle transition.
const ACTIONS = new Set(['send', 'receive']);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
): Promise<Response> {
  const { id, action } = await params;
  if (!ACTIONS.has(action)) {
    return Response.json({ error: `unknown transmittal action '${action}'` }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/doccontrol/transmittals/${id}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Document Control API unreachable' }, { status: 502 });
  }
}
