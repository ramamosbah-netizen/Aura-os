import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Bind an employment record to a platform account, or release it.
 *
 * A pass-through: the API owns the rules (registered, active, held by nobody else) and the
 * permission. Deciding any of that here would put a second, weaker copy of an identity rule in
 * front of the one that actually governs.
 */
export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await props.params;
  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  if (!body.userId?.trim()) {
    return Response.json({ error: 'userId is required' }, { status: 400 });
  }
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/hr/employees/${id}/account`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ userId: body.userId.trim() }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'HR API unreachable' }, { status: 502 });
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await props.params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/hr/employees/${id}/account`, {
      method: 'DELETE',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'HR API unreachable' }, { status: 502 });
  }
}
