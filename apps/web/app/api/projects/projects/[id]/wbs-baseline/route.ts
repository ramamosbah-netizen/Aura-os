import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * BFF: approve the opening WBS baseline.
 *
 * Needed because the lifecycle gate refuses execution without one — and until this route existed
 * there was no way to create a baseline from the app at all. The gate was therefore a dead end: it
 * asked for evidence the product could not produce, which is a worse failure than no gate, because
 * the person can see what is wanted and still cannot do it.
 *
 * The API stamps the approver from the session and refuses to re-baseline, so this carries no body.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/projects/${id}/wbs-baseline`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: '{}',
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
