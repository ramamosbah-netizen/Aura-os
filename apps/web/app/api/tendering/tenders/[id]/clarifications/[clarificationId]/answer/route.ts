import { apiBase, authHeader } from '@/lib/api';

// T4 — answer a clarification / acknowledge an addendum.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; clarificationId: string }> }
): Promise<Response> {
  const { id, clarificationId } = await params;
  try {
    const body = await request.json();
    const res = await fetch(`${apiBase()}/api/v1/tendering/tenders/${id}/clarifications/${clarificationId}/answer`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
