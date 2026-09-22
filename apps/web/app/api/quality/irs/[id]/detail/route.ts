import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * The inspection with its photographs and its signature.
 *
 * A read of its own, not a member of the `[action]` forwarder beside it: that one allow-lists POST
 * verbs, and a verb that is safe to POST is not therefore safe to GET. The whole point of an
 * allow-list is that it does not grow by accident.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/quality/irs/${id}/detail`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Quality API unreachable' }, { status: 502 });
  }
}
