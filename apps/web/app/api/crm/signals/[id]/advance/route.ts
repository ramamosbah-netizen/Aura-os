import { apiBase, authHeader } from '@/lib/api';

// BFF: advance a signal through triage (NEW → REVIEWING → RESEARCHING).

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const body = await request.text();
    const res = await fetch(`${apiBase()}/api/v1/crm/signals/${id}/advance`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body,
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
