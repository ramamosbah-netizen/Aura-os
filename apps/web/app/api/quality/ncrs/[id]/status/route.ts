import { apiBase, authHeader } from '@/lib/api';

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await props.params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
    rootCause?: string;
    proposedCorrection?: string;
  };

  if (!body.status) {
    return Response.json({ error: 'Missing status' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/quality/ncrs/${id}/status`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Quality API unreachable' }, { status: 502 });
  }
}
