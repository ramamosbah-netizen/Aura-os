import { apiFetch, apiBase, authHeader } from '@/lib/api';

const ALLOWED = new Set(['activate', 'close']);
/**
 * A system checklist's governed acts (TC-08/TC-09). Approval and return are refused by the API to
 * the person who prepared the revision; this layer only carries the request.
 */
const SYSTEM_ACTIONS = new Set(['submit', 'approve', 'return', 'revise']);

export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  const { id, action } = await params;
  if (!SYSTEM_ACTIONS.has(action)) return Response.json({ error: 'unknown action' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/quality/itps/${id}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body ?? {}),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Quality API unreachable' }, { status: 502 });
  }
}

export async function PUT(_req: Request, { params }: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  const { id, action } = await params;
  if (!ALLOWED.has(action)) return Response.json({ error: 'unknown action' }, { status: 404 });
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/quality/itps/${id}/${action}`, {
      method: 'PUT',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Quality API unreachable' }, { status: 502 });
  }
}
