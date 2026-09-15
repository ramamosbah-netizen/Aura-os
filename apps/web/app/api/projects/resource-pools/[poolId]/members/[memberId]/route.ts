import { apiBase, apiFetch, authHeader } from '@/lib/api';

export async function DELETE(
  _request: Request,
  props: { params: Promise<{ poolId: string; memberId: string }> },
): Promise<Response> {
  const { poolId, memberId } = await props.params;
  try {
    const res = await apiFetch(
      `${apiBase()}/api/v1/projects/resource-pools/${encodeURIComponent(poolId)}/members/${encodeURIComponent(memberId)}`,
      { method: 'DELETE', headers: await authHeader(), cache: 'no-store' },
    );
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
