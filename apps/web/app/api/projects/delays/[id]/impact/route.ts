import { apiBase, apiFetch, authHeader } from '@/lib/api';

// What this delay is doing to the completion date, derived by the API on every read: the same CPM
// run as planned and with the delay inserted, and the two finishes diffed in working days.
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await props.params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/delays/${encodeURIComponent(id)}/impact`, {
      headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
