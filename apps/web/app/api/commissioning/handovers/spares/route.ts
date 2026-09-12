import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Spares handed to the client (TC-GATE-16) — Handover's own authority, and the last of the six
 * readiness items to get one.
 *
 * Inventory records a part being ISSUED TO A PROJECT, which is how it gets installed. Handing spare
 * parts to the building owner is a different event with a different counterparty, and nothing in the
 * repository held it. The O&M pack's recommended-spares list is a document; a list is not a delivery.
 */
export async function GET(request: Request): Promise<Response> {
  const projectId = new URL(request.url).searchParams.get('projectId');
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/handovers/spares${query}`, {
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
  if (!body.commissioningId) return Response.json({ error: 'commissioningId is required' }, { status: 400 });
  if (!body.description) return Response.json({ error: 'description is required' }, { status: 400 });
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/handovers/spares`, {
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
