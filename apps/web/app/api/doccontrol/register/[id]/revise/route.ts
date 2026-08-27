import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Revise a register entry — bumps the controlled revision + status, keeping the entry.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { revision?: string; status?: string; revisionDate?: string };

  if (!body.revision || !body.status) {
    return Response.json({ error: 'revision and status required' }, { status: 400 });
  }

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/doccontrol/register/${id}/revise`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Doc Control API unreachable' }, { status: 502 });
  }
}
