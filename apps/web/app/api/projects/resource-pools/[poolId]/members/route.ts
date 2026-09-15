import { apiBase, apiFetch, authHeader } from '@/lib/api';

// The roster of one pool. The API owns who may change it and whether the employee is canonical;
// this passes through so a second, weaker copy of those rules cannot drift from the real one.

export async function GET(_request: Request, props: { params: Promise<{ poolId: string }> }): Promise<Response> {
  const { poolId } = await props.params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/resource-pools/${encodeURIComponent(poolId)}/members`, {
      headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request, props: { params: Promise<{ poolId: string }> }): Promise<Response> {
  const { poolId } = await props.params;
  try {
    const body = await request.text();
    const res = await apiFetch(`${apiBase()}/api/v1/projects/resource-pools/${encodeURIComponent(poolId)}/members`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body, cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
