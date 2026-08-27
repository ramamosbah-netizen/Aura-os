import { apiBase, authHeader } from '@/lib/api';

// BFF: ADR-0020 — the evidence-bearing qualification writer (status + evidence + source per
// dimension). apps/web proxies the API PER-PATH, so without this file the route exists on the API
// and still 404s from the browser.
//
// `confirmedBy` / `confirmedAt` are not forwarded because they are not accepted: the API stamps them
// from the authenticated actor and the server clock.

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/opportunities/${id}/qualification`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
