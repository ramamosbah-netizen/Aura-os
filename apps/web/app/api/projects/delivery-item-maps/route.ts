import { type NextRequest } from 'next/server';
import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** BFF read for immutable commercial-to-delivery lineage. */
export async function GET(request: NextRequest): Promise<Response> {
  const query = new URLSearchParams();
  for (const key of ['projectId', 'handoverId', 'frozenItemKey']) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) query.set(key, value);
  }
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/delivery-item-maps?${query.toString()}`, {
      headers: await authHeader(), cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}

/** The browser supplies only its delivery choices; source lineage is resolved by Projects. */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const frozenItemKey = typeof body.frozenItemKey === 'string' ? body.frozenItemKey.trim() : '';
  const wbsNodeId = typeof body.wbsNodeId === 'string' ? body.wbsNodeId : '';
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 });
  if (!frozenItemKey) return Response.json({ error: 'frozenItemKey required' }, { status: 400 });
  if (!wbsNodeId) return Response.json({ error: 'wbsNodeId required' }, { status: 400 });

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/delivery-item-maps`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        projectId,
        frozenItemKey,
        wbsNodeId,
        cbsNodeId: typeof body.cbsNodeId === 'string' && body.cbsNodeId ? body.cbsNodeId : null,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
