import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: record a bid submission WITH its facts (method, portal, reference, validity). The submitted
// value is never forwarded from here — the API resolves it from the approved commercial baseline.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const facts: Record<string, string> = {};
  for (const key of ['method', 'portal', 'reference', 'validUntil', 'addendaAcknowledged', 'notes']) {
    if (typeof body[key] === 'string' && (body[key] as string).trim()) facts[key] = (body[key] as string).trim();
  }
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${id}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(facts),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
