import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Record that a Quality ITP — or one point of it — applies to this system (TC-GATE-3).
 *
 * T&C writes only the LINK. The plan, its acceptance criteria and its results stay Quality's. The
 * link is explicit because the two sides cannot be joined automatically: an ITP carries a free-text
 * discipline, a commissioning record carries the canonical ELV system, and matching them by string
 * would put the wrong acceptance criteria in front of an engineer.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { itpId?: string; pointIndex?: number; testItemId?: string };
  if (!body.itpId?.trim()) return Response.json({ error: 'itpId is required' }, { status: 400 });

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/${id}/itp-links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Commissioning API unreachable' }, { status: 502 });
  }
}
