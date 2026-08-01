import { apiBase, authHeader } from '@/lib/api';

// Mark a commissioning record failed, with the reason for the retest trail.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string };

  if (!body.reason) {
    return Response.json({ error: 'reason required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/v1/commissioning/records/${id}/fail`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Commissioning API unreachable' }, { status: 502 });
  }
}
