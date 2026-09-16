import { apiFetch, apiBase, authHeader } from '@/lib/api';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/doccontrol/transmittals/${id}/acknowledge`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      // An explicit body, not nothing: the acknowledgement carries an optional note, and a PUT
      // declaring a JSON content-type with no body at all is rejected by the parser before the
      // "only a named recipient may acknowledge" rule is ever reached.
      body: (await request.text()) || '{}',
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'DocControl API unreachable' }, { status: 502 });
  }
}
