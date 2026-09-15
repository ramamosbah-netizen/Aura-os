import { apiBase, apiFetch, authHeader } from '@/lib/api';

// The explicit hand-off from a delay assessment to a recovery scenario. It produces a PROPOSAL and
// changes not one stored date; making it current is a separate governed act.
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await props.params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/delays/${encodeURIComponent(id)}/recovery-proposal`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: '{}', cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
