import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Both defect authorities for a project (TC-GATE-9).
 *
 * Quality owns snags; Testing & Commissioning owns punch items. They are separate records with
 * separate scopes, severity scales and lifecycles, and this proxy merges neither — the surface shows
 * each under its own name. Handover writes neither: a third writer for a defect is the last thing
 * this system needs.
 */
export async function GET(request: Request): Promise<Response> {
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!projectId) return Response.json({ error: 'projectId is required' }, { status: 400 });
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/handovers/defects?projectId=${encodeURIComponent(projectId)}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Handover API unreachable' }, { status: 502 });
  }
}
