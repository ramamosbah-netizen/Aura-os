import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: open the authenticated caller's project-team conversation.
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const { projectId } = await params;
    const res = await apiFetch(`${apiBase()}/api/v1/comms/projects/${encodeURIComponent(projectId)}`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Comms API unreachable' }, { status: 502 });
  }
}
