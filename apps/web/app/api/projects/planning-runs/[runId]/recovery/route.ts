import { apiBase, apiFetch, authHeader } from '@/lib/api';

// What this proposal would recover against the programme as it stands: current finish, proposed
// finish, and the working days between them. Derived by the API on every read.
export async function GET(_request: Request, props: { params: Promise<{ runId: string }> }): Promise<Response> {
  const { runId } = await props.params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/planning-runs/${encodeURIComponent(runId)}/recovery`, {
      headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
