import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** QA/QC's queue for a project: what Testing & Commissioning escalated, and Quality's decisions (TC-08). */
export async function GET(request: Request): Promise<Response> {
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!projectId) return Response.json({ error: 'projectId is required' }, { status: 400 });
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/quality/escalations?projectId=${encodeURIComponent(projectId)}`, { headers: await authHeader(), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Quality API unreachable' }, { status: 502 });
  }
}
