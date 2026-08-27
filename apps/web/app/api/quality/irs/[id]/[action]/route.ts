import { apiFetch, apiBase, authHeader } from '@/lib/api';

// IR workflow-command forwarder (POST verbs): start the inspection, or raise an NCR from a failed
// one. `resolve` keeps its own PUT route. The backend enforces the transition.
const ACTIONS = new Set(['start-inspection', 'raise-ncr']);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
): Promise<Response> {
  const { id, action } = await params;
  if (!ACTIONS.has(action)) {
    return Response.json({ error: `unknown inspection action '${action}'` }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/quality/irs/${id}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Quality API unreachable' }, { status: 502 });
  }
}
