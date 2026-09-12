import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * The O&M pack for a project (TC-GATE-5) — Handover's own authority.
 *
 * The deliverables and their states live here; the DOCUMENTS live in DocControl and are referenced,
 * never copied. POST adds one deliverable; `?seed=1` lays out the standard pack for a system.
 */
export async function GET(request: Request): Promise<Response> {
  const projectId = new URL(request.url).searchParams.get('projectId');
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/handovers/om-items${query}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Handover API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const seed = new URL(request.url).searchParams.get('seed') === '1';
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.commissioningId) return Response.json({ error: 'commissioningId is required' }, { status: 400 });
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/handovers/om-items${seed ? '/seed' : ''}`, {
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
