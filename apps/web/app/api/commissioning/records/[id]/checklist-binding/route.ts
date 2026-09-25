import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Bind this system to Quality's approved checklist revision — explicitly, by the revision's id. The
 * API refuses another project's, another system's, an unapproved or a superseded revision, and a
 * record already bound: the binding is pinned for good once made.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { itpId?: string };
  if (!body.itpId?.trim()) return Response.json({ error: 'itpId is required' }, { status: 400 });
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/${id}/checklist-binding`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ itpId: body.itpId }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Commissioning API unreachable' }, { status: 502 });
  }
}
