import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** The two service-state acts on a vehicle (F-08). Anything else is not a route. */
const ACTIONS = new Set(['out-of-service', 'return-to-service']);

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string; action: string }> },
): Promise<Response> {
  const { id, action } = await props.params;
  if (!ACTIONS.has(action)) return Response.json({ message: `unknown vehicle action ${action}` }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/fleet/vehicles/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ message: 'Fleet API unreachable' }, { status: 502 });
  }
}
