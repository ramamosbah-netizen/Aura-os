import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Records the consultant's response to a Technical Query (open → responded), or replaces one that
// already stands — which costs a reason, because site builds to the answer.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  // The whole body is forwarded: it carries the answer AND, when one already stands, the reason it
  // is being replaced. Dropping that field would make every supersede fail as "no reason given"
  // while the engineer watched themselves type one.
  const body = (await request.json().catch(() => ({}))) as { response?: string; supersededReason?: string };

  if (!body.response) {
    return Response.json({ error: 'response required' }, { status: 400 });
  }

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/engineering/technical-queries/${id}/respond`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Engineering API unreachable' }, { status: 502 });
  }
}
