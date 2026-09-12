import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Client training and demonstration (TC-GATE-5) — Handover's own authority.
 *
 * The CLIENT's people, not ours: HSE's training records are worker safety, about different people,
 * and neither may stand in for the other.
 */
export async function GET(request: Request): Promise<Response> {
  const projectId = new URL(request.url).searchParams.get('projectId');
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/handovers/training${query}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Handover API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.projectId) return Response.json({ error: 'projectId is required' }, { status: 400 });
  if (!body.title) return Response.json({ error: 'title is required' }, { status: 400 });
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/handovers/training`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Handover API unreachable' }, { status: 502 });
  }
}
