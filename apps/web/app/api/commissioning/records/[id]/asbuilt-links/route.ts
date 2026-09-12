import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Record that a controlled drawing is this system's as-built (TC-GATE-8).
 *
 * The same shape as the ITP link beside it, and for the same reason: document control owns the
 * drawing — its number, revision and status — and T&C owns one sentence about it. The link is
 * explicit because the two sides cannot be joined automatically: every ELV system on a project
 * shares the discipline `elv`, so discipline cannot tell one system's as-built from another's.
 *
 * The API refuses a reference the project register does not hold, and refuses one that is in the
 * register but not marked as-built.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { documentId?: string };
  if (!body.documentId?.trim()) return Response.json({ error: 'documentId is required' }, { status: 400 });

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/${id}/asbuilt-links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Commissioning API unreachable' }, { status: 502 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/${id}/asbuilt-links`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Commissioning API unreachable' }, { status: 502 });
  }
}
