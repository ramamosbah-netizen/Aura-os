import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * BFF: the cross-domain health read (§24).
 *
 * Read-only, and there is deliberately no sibling that writes. Health explains; §2 authorises
 * transitions and §27 authorises closeout. A POST here would be the moment it became a third gate.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/projects/${id}/health`, {
      headers: { ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => null);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
