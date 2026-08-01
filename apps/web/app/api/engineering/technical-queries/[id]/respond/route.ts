import { apiBase, authHeader } from '@/lib/api';

// Records the consultant's response to a Technical Query (moves open → responded).
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { response?: string };

  if (!body.response) {
    return Response.json({ error: 'response required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/v1/engineering/technical-queries/${id}/respond`, {
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
